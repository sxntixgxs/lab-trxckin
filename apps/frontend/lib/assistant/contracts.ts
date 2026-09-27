import { z } from 'zod';

export const ASSISTANT_MODELS = [
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number]['id'];
export const DEFAULT_ASSISTANT_MODEL: AssistantModel = ASSISTANT_MODELS[0].id;
export const assistantModelSchema = z.enum(ASSISTANT_MODELS.map((model) => model.id));
export const assistantDomainSchema = z.enum(['billing', 'suppliers', 'customers', 'advances', 'pettyCash']);
export type AssistantDomain = z.infer<typeof assistantDomainSchema>;
export type AssistantLanguage = 'es' | 'en';
export const ASSISTANT_LIMITS = {
  questionsPerHour: 30,
  dictationsPerHour: 10,
  toolRounds: 10,
  answerTimeoutMs: 120_000,
  transcriptionTimeoutMs: 60_000,
  recordingDurationMs: 120_000,
  recordingBytes: 3 * 1024 * 1024,
  promptCharacters: 12_000,
} as const;

export const assistantContextSchema = z
  .object({
    domain: assistantDomainSchema,
    recordId: z.string().min(1).max(200).optional(),
    label: z.string().min(1).max(160),
  })
  .strict();
export type AssistantContext = z.infer<typeof assistantContextSchema>;

export type AssistantRecordType =
  'invoice' | 'supplier' | 'customer' | 'advance' | 'cashBox' | 'cashMovement' | 'cashReimbursement';
export interface AssistantRecordReference {
  id: string;
  domain: AssistantDomain;
  recordType: AssistantRecordType;
  companyId: number;
  title: string;
  href: string;
  subtitle?: string;
  status?: string;
  amount?: number;
  currency?: string;
  owner?: string;
  date?: string;
}

export interface AssistantSourceRequirement {
  domain: AssistantDomain;
  kind: 'record' | 'aggregate' | 'workflow' | 'erp';
  companyId: number;
  recordId?: string;
  recordType?: AssistantRecordType;
  accessFingerprint?: string;
  erpMode?: 'search' | 'document';
  permission?: string;
}

export type AssistantCell = string | number | boolean | null;
export interface AssistantToolResult {
  title: string;
  records: AssistantRecordReference[];
  rows: Array<Record<string, AssistantCell>>;
  sources: AssistantSourceRequirement[];
  metadata: {
    complete: boolean;
    returned: number;
    scanned: number;
    limit: number;
    nextCursor: string | null;
    companyIds: number[];
    currency: string | null;
    from: string | null;
    to: string | null;
    asOf: number;
    notes: string[];
  };
  guide?: { steps: string[]; sourcePaths: string[] };
  summary?: Record<string, number>;
  chart?: AssistantChart;
  error?: string;
}

export const assistantChartSchema = z
  .object({
    type: z.enum(['bar', 'line', 'donut']),
    title: z.string().min(1).max(160),
    labelKey: z.string().min(1).max(80),
    valueKey: z.string().min(1).max(80),
    currency: z.string().max(8).optional(),
  })
  .strict();
export type AssistantChart = z.infer<typeof assistantChartSchema>;

export const assistantSendSchema = z
  .object({
    conversationId: z.string().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(ASSISTANT_LIMITS.promptCharacters),
    companyId: z.number().int().positive().nullable(),
    model: assistantModelSchema,
    language: z.enum(['es', 'en']),
    context: assistantContextSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type AssistantSendRequest = z.infer<typeof assistantSendSchema>;
export type AssistantRunStatus = 'running' | 'waiting_erp' | 'completed' | 'cancelled' | 'failed';
export interface AssistantPendingTool {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export const assistantErpSchema = z
  .object({
    domain: z.enum(['suppliers', 'customers']),
    operation: z.enum(['search', 'document']),
    companyId: z.number().int().positive(),
    search: z.string().trim().min(1).max(100),
    documentType: z.enum(['NIT', 'C.C.', 'C.E', 'P.A.']).optional(),
    cursor: z
      .string()
      .regex(/^[1-9]\d{0,3}$/)
      .optional(),
    limit: z.number().int().min(1).max(30).default(10),
  })
  .strict()
  .refine((value) => value.operation !== 'document' || value.search.length <= 30, {
    message: 'El documento admite hasta 30 caracteres.',
  });
export type AssistantErpInput = z.infer<typeof assistantErpSchema>;

export const ASSISTANT_DOMAIN_LABELS: Record<AssistantDomain, string> = {
  billing: 'Facturación',
  suppliers: 'Proveedores',
  customers: 'Clientes',
  advances: 'Anticipos',
  pettyCash: 'Cajas menores',
};

export const assistantRecordTypeSchema = z.enum([
  'invoice',
  'supplier',
  'customer',
  'advance',
  'cashBox',
  'cashMovement',
  'cashReimbursement',
]);
export const assistantSourceRequirementSchema: z.ZodType<AssistantSourceRequirement> = z
  .object({
    domain: assistantDomainSchema,
    kind: z.enum(['record', 'aggregate', 'workflow', 'erp']),
    companyId: z.number().int().positive(),
    recordId: z.string().max(200).optional(),
    recordType: assistantRecordTypeSchema.optional(),
    accessFingerprint: z.string().max(20_000).optional(),
    erpMode: z.enum(['search', 'document']).optional(),
    permission: z.string().max(160).optional(),
  })
  .strict();
export const assistantRecordReferenceSchema: z.ZodType<AssistantRecordReference> = z
  .object({
    id: z.string().max(200),
    domain: assistantDomainSchema,
    recordType: assistantRecordTypeSchema,
    companyId: z.number().int().positive(),
    title: z.string().max(300),
    href: z
      .string()
      .max(1000)
      .refine((value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')),
    subtitle: z.string().max(500).optional(),
    status: z.string().max(120).optional(),
    amount: z.number().finite().optional(),
    currency: z.string().max(8).optional(),
    owner: z.string().max(200).optional(),
    date: z.string().max(80).optional(),
  })
  .strict();
export const assistantToolResultSchema: z.ZodType<AssistantToolResult> = z
  .object({
    title: z.string().max(300),
    records: z.array(assistantRecordReferenceSchema).max(100),
    rows: z
      .array(z.record(z.string().max(120), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])))
      .max(100),
    sources: z.array(assistantSourceRequirementSchema).max(1000),
    metadata: z
      .object({
        complete: z.boolean(),
        returned: z.number().int().nonnegative(),
        scanned: z.number().int().nonnegative(),
        limit: z.number().int().nonnegative(),
        nextCursor: z.string().max(2000).nullable(),
        companyIds: z.array(z.number().int().positive()).max(100),
        currency: z.string().max(8).nullable(),
        from: z.string().max(80).nullable(),
        to: z.string().max(80).nullable(),
        asOf: z.number().finite(),
        notes: z.array(z.string().max(2000)).max(30),
      })
      .strict(),
    guide: z
      .object({ steps: z.array(z.string().max(4000)).max(30), sourcePaths: z.array(z.string().max(500)).max(20) })
      .strict()
      .optional(),
    summary: z.record(z.string().max(120), z.number().finite()).optional(),
    chart: assistantChartSchema.optional(),
    error: z.string().max(1000).optional(),
  })
  .strict();
