import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const agreement = v.object({ dailyMinutes: v.number(), weeklyMinutes: v.number(), restDay: v.number() });
export const policy = v.object({
  version: v.string(),
  effectiveFrom: v.string(),
  ordinaryDailyMinutes: v.number(),
  ordinaryWeeklyMinutes: v.number(),
  nightStartMinute: v.number(),
  nightEndMinute: v.number(),
  mealAfterMinutes: v.number(),
  mealMinutes: v.number(),
  mealOffsetMinutes: v.number(),
  maxExtraDailyMinutes: v.number(),
  maxExtraWeeklyMinutes: v.number(),
});
export const interval = v.object({ start: v.number(), end: v.number() });
export const totals = v.object({
  ordinaryDay: v.number(),
  ordinaryNight: v.number(),
  extraDay: v.number(),
  extraNight: v.number(),
  restDay: v.number(),
  restNight: v.number(),
  restExtraDay: v.number(),
  restExtraNight: v.number(),
});
export const calculation = v.object({
  id: v.string(),
  date: v.string(),
  totalMinutes: v.number(),
  grossMinutes: v.number(),
  mealMinutes: v.number(),
  totals,
  incidents: v.array(v.string()),
  policyVersion: v.string(),
});
export const scheduledBlock = v.object({
  start: v.number(),
  end: v.number(),
  templateId: v.optional(v.string()),
  label: v.string(),
  color: v.string(),
});
export const markKind = v.union(v.literal('IN'), v.literal('OUT'));
export const actorValidator = v.object({
  userId: v.string(),
  workosUserId: v.string(),
  name: v.string(),
  permissions: v.array(v.string()),
  companyIds: v.array(v.number()),
  allCompanies: v.boolean(),
  admin: v.boolean(),
});
const dated = { companyId: v.number(), employeeId: v.string(), groupId: v.string(), date: v.string() };

export const workforceTables = {
  wfEmployees: defineTable({
    companyId: v.number(),
    code: v.string(),
    name: v.string(),
    job: v.string(),
    active: v.boolean(),
    linkedUserId: v.optional(v.string()),
    agreement,
    revision: v.number(),
  })
    .index('by_companyId', ['companyId'])
    .index('by_companyId_and_code', ['companyId', 'code'])
    .index('by_companyId_and_linkedUserId', ['companyId', 'linkedUserId']),
  wfGroups: defineTable({
    companyId: v.number(),
    name: v.string(),
    description: v.string(),
    managerIds: v.array(v.string()),
    siteIds: v.array(v.string()),
    active: v.boolean(),
    revision: v.number(),
  }).index('by_companyId', ['companyId']),
  wfMemberships: defineTable({
    companyId: v.number(),
    employeeId: v.string(),
    groupId: v.string(),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
  })
    .index('by_companyId', ['companyId'])
    .index('by_companyId_and_employeeId_and_effectiveFrom', ['companyId', 'employeeId', 'effectiveFrom'])
    .index('by_companyId_and_groupId_and_effectiveFrom', ['companyId', 'groupId', 'effectiveFrom']),
  wfSites: defineTable({
    companyId: v.number(),
    name: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    radius: v.number(),
    tolerance: v.number(),
    maxAccuracy: v.number(),
    maxAgeSeconds: v.number(),
    active: v.boolean(),
    revision: v.number(),
  }).index('by_companyId', ['companyId']),
  wfTemplates: defineTable({
    companyId: v.number(),
    name: v.string(),
    code: v.string(),
    color: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    active: v.boolean(),
    revision: v.number(),
  }).index('by_companyId', ['companyId']),
  wfSchedules: defineTable({
    ...dated,
    blocks: v.array(scheduledBlock),
    siteId: v.optional(v.string()),
    observation: v.string(),
    isRest: v.boolean(),
    revision: v.number(),
    agreement,
    policy,
    planned: calculation,
    recurrenceId: v.optional(v.string()),
  })
    .index('by_companyId_and_date', ['companyId', 'date'])
    .index('by_companyId_and_employeeId_and_date', ['companyId', 'employeeId', 'date'])
    .index('by_companyId_and_groupId_and_date', ['companyId', 'groupId', 'date']),
  wfMarks: defineTable({
    ...dated,
    kind: markKind,
    timestamp: v.number(),
    origin: v.union(v.literal('SELF_GPS'), v.literal('SUPERVISOR_GPS'), v.literal('MANUAL'), v.literal('DEMO')),
    actorId: v.string(),
    actorName: v.string(),
    reason: v.string(),
    gps: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracy: v.number(),
        timestamp: v.number(),
        siteId: v.string(),
        siteName: v.string(),
        distance: v.number(),
      }),
    ),
    excluded: v.boolean(),
    effectiveKind: v.optional(markKind),
    effectiveTimestamp: v.optional(v.number()),
    originalDate: v.string(),
    originalGroupId: v.string(),
    revision: v.number(),
  })
    .index('by_companyId_and_date', ['companyId', 'date'])
    .index('by_companyId_and_employeeId_and_date', ['companyId', 'employeeId', 'date'])
    .index('by_companyId_and_groupId_and_date', ['companyId', 'groupId', 'date']),
  wfAttendance: defineTable({
    ...dated,
    scheduleId: v.optional(v.string()),
    scheduleRevision: v.optional(v.number()),
    blocks: v.array(interval),
    openEntry: v.optional(v.number()),
    mealOverrideMinutes: v.optional(v.number()),
    revision: v.number(),
    status: v.union(v.literal('PENDING'), v.literal('REVIEWED')),
    incidents: v.array(v.string()),
    resolution: v.optional(v.string()),
    actual: calculation,
    markIds: v.array(v.string()),
    agreement,
    policy,
  })
    .index('by_companyId_and_date', ['companyId', 'date'])
    .index('by_companyId_and_employeeId_and_date', ['companyId', 'employeeId', 'date'])
    .index('by_companyId_and_groupId_and_date', ['companyId', 'groupId', 'date']),
  // One compact lock per worker; cannot miss an open session outside a UI range.
  wfSessions: defineTable({
    companyId: v.number(),
    employeeId: v.string(),
    attendanceId: v.string(),
    date: v.string(),
    groupId: v.string(),
    entryTimestamp: v.number(),
  })
    .index('by_companyId_and_employeeId', ['companyId', 'employeeId'])
    .index('by_companyId_and_groupId', ['companyId', 'groupId']),
  wfSettings: defineTable({
    companyId: v.number(),
    launchDate: v.string(),
    hrUserIds: v.array(v.string()),
    revision: v.number(),
  }).index('by_companyId', ['companyId']),
  wfPolicies: defineTable({ companyId: v.number(), policy }).index('by_companyId_and_effectiveFrom', [
    'companyId',
    'policy.effectiveFrom',
  ]),
  wfClosures: defineTable({
    companyId: v.number(),
    groupId: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    state: v.union(v.literal('OPEN'), v.literal('CLOSING'), v.literal('CLOSED'), v.literal('CORRECTION_TH')),
    revision: v.number(),
    reason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.string()),
  })
    .index('by_companyId_and_groupId_and_periodStart', ['companyId', 'groupId', 'periodStart'])
    .index('by_companyId_and_periodStart', ['companyId', 'periodStart']),
  wfAudit: defineTable({
    companyId: v.number(),
    actorId: v.string(),
    actorName: v.string(),
    action: v.string(),
    targetId: v.string(),
    timestamp: v.number(),
    reason: v.string(),
    details: v.string(),
  })
    .index('by_companyId_and_timestamp', ['companyId', 'timestamp'])
    .index('by_companyId_and_targetId_and_timestamp', ['companyId', 'targetId', 'timestamp']),
  wfRequests: defineTable({
    companyId: v.number(),
    actorId: v.string(),
    requestId: v.string(),
    payload: v.string(),
    response: v.string(),
    timestamp: v.number(),
  }).index('by_companyId_and_actorId_and_requestId', ['companyId', 'actorId', 'requestId']),
  wfRecurrences: defineTable({
    companyId: v.number(),
    key: v.string(),
    employeeId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    everyWeeks: v.number(),
    createdBy: v.string(),
  }).index('by_companyId_and_key', ['companyId', 'key']),
};
