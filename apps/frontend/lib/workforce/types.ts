/** Shared, serializable workforce contracts. IDs are opaque Convex IDs at the boundary. */
export type Interval = { start: number; end: number };
export type Agreement = { dailyMinutes: number; weeklyMinutes: number; restDay: number };
export type CalculationPolicy = {
  version: string;
  effectiveFrom: string;
  ordinaryDailyMinutes: number;
  ordinaryWeeklyMinutes: number;
  nightStartMinute: number;
  nightEndMinute: number;
  mealAfterMinutes: number;
  mealMinutes: number;
  mealOffsetMinutes: number;
  maxExtraDailyMinutes: number;
  maxExtraWeeklyMinutes: number;
};
export type HourCategory =
  | 'ordinaryDay'
  | 'ordinaryNight'
  | 'extraDay'
  | 'extraNight'
  | 'restDay'
  | 'restNight'
  | 'restExtraDay'
  | 'restExtraNight';
export type HourTotals = Record<HourCategory, number>;
export type CalculationInput = {
  id: string;
  date: string;
  blocks: Interval[];
  agreement: Agreement;
  policy: CalculationPolicy;
  breaks?: Interval[];
  mealOverrideMinutes?: number;
};
export type CalculationResult = {
  id: string;
  date: string;
  totalMinutes: number;
  grossMinutes: number;
  mealMinutes: number;
  totals: HourTotals;
  incidents: string[];
  policyVersion: string;
};
export type Employee = {
  id: string;
  companyId: number;
  code: string;
  name: string;
  job: string;
  active: boolean;
  linkedUserId?: string;
  agreement: Agreement;
  revision: number;
};
export type Group = {
  id: string;
  companyId: number;
  name: string;
  description: string;
  managerIds: string[];
  siteIds: string[];
  active: boolean;
  revision: number;
};
export type Membership = {
  id: string;
  companyId: number;
  employeeId: string;
  groupId: string;
  effectiveFrom: string;
  effectiveTo?: string;
};
export type Site = {
  id: string;
  companyId: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  tolerance: number;
  maxAccuracy: number;
  maxAgeSeconds: number;
  active: boolean;
  revision: number;
};
export type ShiftTemplate = {
  id: string;
  companyId: number;
  name: string;
  code: string;
  color: string;
  startTime: string;
  endTime: string;
  active: boolean;
  revision: number;
};
export type ScheduledBlock = Interval & { templateId?: string; label: string; color: string };
export type ScheduleDay = {
  id: string;
  companyId: number;
  employeeId: string;
  groupId: string;
  date: string;
  blocks: ScheduledBlock[];
  siteId?: string;
  observation: string;
  isRest: boolean;
  revision: number;
  agreement: Agreement;
  policy: CalculationPolicy;
  planned: CalculationResult;
};
export type GpsFix = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type AttendanceMark = {
  id: string;
  companyId: number;
  employeeId: string;
  groupId: string;
  date: string;
  kind: 'IN' | 'OUT';
  timestamp: number;
  origin: 'SELF_GPS' | 'SUPERVISOR_GPS' | 'MANUAL' | 'DEMO';
  actorId: string;
  actorName: string;
  reason: string;
  gps?: GpsFix & { siteId: string; siteName: string; distance: number };
  excluded: boolean;
  effectiveKind?: 'IN' | 'OUT';
  effectiveTimestamp?: number;
  revision: number;
};
export type AttendanceDay = {
  id: string;
  companyId: number;
  employeeId: string;
  groupId: string;
  date: string;
  scheduleId?: string;
  blocks: Interval[];
  openEntry?: number;
  mealOverrideMinutes?: number;
  revision: number;
  status: 'PENDING' | 'REVIEWED';
  incidents: string[];
  resolution?: string;
  actual: CalculationResult;
  markIds: string[];
};
export type Closure = {
  id: string;
  companyId: number;
  groupId: string;
  periodStart: string;
  periodEnd: string;
  state: 'OPEN' | 'CLOSING' | 'CLOSED' | 'CORRECTION_TH';
  revision: number;
  reason?: string;
  closedAt?: number;
  closedBy?: string;
};
export type WorkforceSettings = {
  companyId: number;
  launchDate: string;
  hrUserIds: string[];
  policies: CalculationPolicy[];
  revision: number;
};
export type Capabilities = {
  admin: boolean;
  hr: boolean;
  manage: boolean;
  selfEmployeeId?: string;
  userId: string;
  userName: string;
  permissions: string[];
};
export type WorkforceSnapshot = {
  companyId: number;
  from: string;
  to: string;
  employees: Employee[];
  groups: Group[];
  memberships: Membership[];
  sites: Site[];
  templates: ShiftTemplate[];
  schedules: ScheduleDay[];
  attendance: AttendanceDay[];
  marks: AttendanceMark[];
  closures: Closure[];
  settings: WorkforceSettings;
  capabilities: Capabilities;
};
export type ScheduleChange = {
  employeeId: string;
  groupId: string;
  date: string;
  blocks: ScheduledBlock[];
  siteId?: string;
  observation: string;
  isRest: boolean;
  expectedRevision: number;
};
export type WorkforceCommand =
  | {
      type: 'saveEmployee';
      employee: Omit<Employee, 'id' | 'companyId' | 'revision'> & { id?: string };
      expectedRevision: number;
    }
  | {
      type: 'saveGroup';
      group: Omit<Group, 'id' | 'companyId' | 'revision'> & { id?: string };
      expectedRevision: number;
    }
  | {
      type: 'transferMember';
      employeeId: string;
      groupId: string;
      effectiveFrom: string;
      reason: string;
      expectedRevision: number;
    }
  | { type: 'saveSite'; site: Omit<Site, 'id' | 'companyId' | 'revision'> & { id?: string }; expectedRevision: number }
  | {
      type: 'saveTemplate';
      template: Omit<ShiftTemplate, 'id' | 'companyId' | 'revision'> & { id?: string };
      expectedRevision: number;
    }
  | { type: 'saveSettings'; hrUserIds: string[]; policy: CalculationPolicy; reason: string; expectedRevision: number }
  | {
      type: 'saveSchedule';
      changes: ScheduleChange[];
      preview: boolean;
      recurrence?: { endDate: string; everyWeeks: number };
    }
  | {
      type: 'mark';
      mode: 'self' | 'supervisor';
      employeeId?: string;
      kind: 'IN' | 'OUT';
      gps: GpsFix;
      reason: string;
      expectedRevision: number;
    }
  | {
      type: 'manualMark';
      employeeId: string;
      groupId: string;
      date: string;
      kind: 'IN' | 'OUT';
      timestamp: number;
      reason: string;
      expectedRevision: number;
    }
  | {
      type: 'editMark';
      markId: string;
      excluded: boolean;
      kind: 'IN' | 'OUT';
      timestamp: number;
      date: string;
      reason: string;
      expectedRevision: number;
    }
  | {
      type: 'reviewAttendance';
      employeeId: string;
      groupId: string;
      date: string;
      mealOverrideMinutes?: number;
      confirmedAbsence?: boolean;
      resolution: string;
      expectedRevision: number;
    }
  | {
      type: 'closePeriod' | 'reopenPeriod';
      groupId: string;
      periodStart: string;
      reason: string;
      expectedRevision: number;
    }
  | { type: 'seedDemo' };
export type CommandEnvelope = { companyId: number; requestId: string; command: WorkforceCommand };
export type CommandResult = {
  ok: true;
  message: string;
  results?: Array<{ employeeId: string; date: string; planned: CalculationResult }>;
  recordId?: string;
  revision?: number;
};
export type DirectoryUser = { id: string; name: string; email: string };
/** Only constructed by the authenticated Next BFF; Convex requires secret + matching JWT. */
export type TrustedActor = {
  userId: string;
  workosUserId: string;
  name: string;
  permissions: string[];
  companyIds: number[];
  allCompanies: boolean;
  admin: boolean;
};
