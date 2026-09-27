import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import type { CommandResult, WorkforceSnapshot } from '../../lib/workforce/types';
import { commandEnvelopeSchema, snapshotQuerySchema } from '../../lib/workforce/schemas';
import { actorValidator } from './schema';
import { authorize, persistSettings } from './common';
import { readSnapshot } from './snapshot';
import { catalogCommand } from './catalog';
import { saveSchedule } from './scheduling';
import { attendanceCommand } from './attendance';
import { closeCommand } from './closures';
import { seedDemo } from './demo';

/** Server-only bridge: both the secret and the caller's independently verified JWT are required. */
export const snapshot = query({
  args: {
    secret: v.string(),
    actor: actorValidator,
    companyId: v.number(),
    from: v.string(),
    to: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<WorkforceSnapshot> => {
    const range = snapshotQuerySchema.parse({ companyId: args.companyId, from: args.from, to: args.to });
    if (!Number.isSafeInteger(args.now) || args.now < 0) throw new Error('Hora de consulta no válida.');
    const access = await authorize(ctx, args.secret, args.actor, args.companyId, args.now);
    return readSnapshot(ctx, access, range.from, range.to, args.now);
  },
});

export const execute = mutation({
  args: { secret: v.string(), actor: actorValidator, companyId: v.number(), requestId: v.string(), command: v.any() },
  handler: async (ctx, args): Promise<CommandResult> => {
    // v.any is deliberately narrowed at the trust boundary by the shared strict union.
    const { command, requestId, companyId } = commandEnvelopeSchema.parse({
      companyId: args.companyId,
      requestId: args.requestId,
      command: args.command,
    });
    const now = Date.now();
    const access = await authorize(ctx, args.secret, args.actor, companyId, now);
    const payload = JSON.stringify(command);
    const previous = await ctx.db
      .query('wfRequests')
      .withIndex('by_companyId_and_actorId_and_requestId', (q) =>
        q.eq('companyId', companyId).eq('actorId', access.actor.userId).eq('requestId', requestId),
      )
      .unique();
    if (previous) {
      if (previous.payload !== payload) throw new Error('El identificador de solicitud ya se usó para otra operación.');
      return JSON.parse(previous.response) as CommandResult;
    }
    if (!(command.type === 'saveSchedule' && command.preview)) await persistSettings(ctx, access);
    let result: CommandResult;
    switch (command.type) {
      case 'saveEmployee':
      case 'saveGroup':
      case 'saveSite':
      case 'saveTemplate':
      case 'saveSettings':
      case 'transferMember':
        result = await catalogCommand(ctx, access, command, now);
        break;
      case 'saveSchedule':
        result = await saveSchedule(ctx, access, command, now);
        break;
      case 'mark':
      case 'manualMark':
      case 'editMark':
      case 'reviewAttendance':
        result = await attendanceCommand(ctx, access, command, now);
        break;
      case 'closePeriod':
      case 'reopenPeriod':
        result = await closeCommand(ctx, access, command, now);
        break;
      case 'seedDemo':
        result = await seedDemo(ctx, access, now);
        break;
    }
    // Preview performs no writes and is always freshly validated. A saved operation
    // retains its exact response, so retries cannot create a second mark or batch.
    if (!(command.type === 'saveSchedule' && command.preview))
      await ctx.db.insert('wfRequests', {
        companyId,
        actorId: access.actor.userId,
        requestId,
        payload,
        response: JSON.stringify(result),
        timestamp: now,
      });
    return result;
  },
});
