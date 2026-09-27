import { z } from 'zod';
import type { CommandEnvelope, WorkforceCommand } from './types';

const id = z.string().trim().min(1).max(150);
const text = z.string().trim().min(1).max(160);
const note = z.string().trim().max(2000);
const reason = z.string().trim().min(3, 'Explica el motivo (mínimo 3 caracteres).').max(2000);
const revision = z.number().int().nonnegative();
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const date = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s;
  }, 'Fecha inválida.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.');
const timestamp = z.number().finite().int().min(0).max(8_640_000_000_000_000);
const agreement = z
  .object({
    dailyMinutes: z.number().int().min(1).max(480),
    weeklyMinutes: z.number().int().min(1).max(2520),
    restDay: z.number().int().min(0).max(6),
  })
  .strict();
export const policySchema = z
  .object({
    version: text,
    effectiveFrom: isoDateSchema,
    ordinaryDailyMinutes: z.number().int().min(1).max(480),
    ordinaryWeeklyMinutes: z.number().int().min(1).max(2520),
    nightStartMinute: z.literal(1140),
    nightEndMinute: z.literal(360),
    mealAfterMinutes: z.number().int().min(0).max(600),
    mealMinutes: z.number().int().min(0).max(180),
    mealOffsetMinutes: z.number().int().min(0).max(600),
    maxExtraDailyMinutes: z.number().int().min(0).max(120),
    maxExtraWeeklyMinutes: z.number().int().min(0).max(720),
  })
  .strict();
const scheduledBlock = z
  .object({
    start: timestamp,
    end: timestamp,
    templateId: id.optional(),
    label: text,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict()
  .refine(
    (b) => b.end > b.start && b.end - b.start <= 24 * 60 * 60_000,
    'El bloque debe durar entre 1 minuto y 24 horas.',
  );
export const scheduleChangeSchema = z
  .object({
    employeeId: id,
    groupId: id,
    date: isoDateSchema,
    blocks: z.array(scheduledBlock).max(3),
    siteId: id.optional(),
    observation: note,
    isRest: z.boolean(),
    expectedRevision: revision,
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.isRest && d.blocks.length) ctx.addIssue({ code: 'custom', message: 'Un descanso no puede tener bloques.' });
    if (!d.isRest && !d.blocks.length)
      ctx.addIssue({ code: 'custom', message: 'Agrega al menos un bloque o marca descanso.' });
    if (d.blocks.length > 1 && d.observation.length < 3)
      ctx.addIssue({ code: 'custom', message: 'Los bloques adicionales requieren una observación.' });
  });
const gps = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().positive().max(100_000),
    timestamp,
  })
  .strict();
export const workforceCommandSchema: z.ZodType<WorkforceCommand> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('saveEmployee'),
      employee: z
        .object({
          id: id.optional(),
          code: text,
          name: text,
          job: note,
          active: z.boolean(),
          linkedUserId: id.optional(),
          agreement,
        })
        .strict(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('saveGroup'),
      group: z
        .object({
          id: id.optional(),
          name: text,
          description: note,
          managerIds: z.array(id).min(1).max(30),
          siteIds: z.array(id).max(100),
          active: z.boolean(),
        })
        .strict(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('transferMember'),
      employeeId: id,
      groupId: id,
      effectiveFrom: isoDateSchema,
      reason,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('saveSite'),
      site: z
        .object({
          id: id.optional(),
          name: text,
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
          radius: z.number().int().min(1).max(10_000),
          tolerance: z.number().int().min(0).max(100),
          maxAccuracy: z.number().int().min(1).max(100),
          maxAgeSeconds: z.number().int().min(1).max(60),
          active: z.boolean(),
        })
        .strict(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('saveTemplate'),
      template: z
        .object({
          id: id.optional(),
          name: text,
          code: text,
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          startTime: time,
          endTime: time,
          active: z.boolean(),
        })
        .strict()
        .refine((t) => t.startTime !== t.endTime, 'Inicio y fin no pueden ser iguales.'),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('saveSettings'),
      hrUserIds: z.array(id).max(50),
      policy: policySchema,
      reason,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('saveSchedule'),
      changes: z.array(scheduleChangeSchema).min(1).max(350),
      preview: z.boolean(),
      recurrence: z
        .object({ endDate: isoDateSchema, everyWeeks: z.number().int().min(1).max(12) })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mark'),
      mode: z.enum(['self', 'supervisor']),
      employeeId: id.optional(),
      kind: z.enum(['IN', 'OUT']),
      gps,
      reason: note,
      expectedRevision: revision,
    })
    .strict()
    .superRefine((m, ctx) => {
      if (m.mode === 'supervisor' && (!m.employeeId || m.reason.length < 3))
        ctx.addIssue({
          code: 'custom',
          message: 'Selecciona el trabajador y explica el motivo de la marcación por supervisor.',
        });
    }),
  z
    .object({
      type: z.literal('manualMark'),
      employeeId: id,
      groupId: id,
      date: isoDateSchema,
      kind: z.enum(['IN', 'OUT']),
      timestamp,
      reason,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('editMark'),
      markId: id,
      excluded: z.boolean(),
      kind: z.enum(['IN', 'OUT']),
      timestamp,
      date: isoDateSchema,
      reason,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('reviewAttendance'),
      employeeId: id,
      groupId: id,
      date: isoDateSchema,
      mealOverrideMinutes: z.number().int().min(0).max(180).optional(),
      confirmedAbsence: z.boolean().optional(),
      resolution: reason,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('closePeriod'),
      groupId: id,
      periodStart: isoDateSchema,
      reason: note,
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal('reopenPeriod'),
      groupId: id,
      periodStart: isoDateSchema,
      reason,
      expectedRevision: revision,
    })
    .strict(),
  z.object({ type: z.literal('seedDemo') }).strict(),
]);
export const commandEnvelopeSchema: z.ZodType<CommandEnvelope> = z
  .object({ companyId: z.number().int().positive(), requestId: z.string().uuid(), command: workforceCommandSchema })
  .strict();
export const snapshotQuerySchema = z
  .object({ companyId: z.coerce.number().int().positive(), from: isoDateSchema, to: isoDateSchema })
  .strict()
  .refine(
    (x) => x.to >= x.from && Date.parse(x.to) - Date.parse(x.from) <= 42 * 86_400_000,
    'Consulta un rango de hasta seis semanas.',
  );
