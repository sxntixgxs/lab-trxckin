import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getValorContableAnticipo } from "./valorContable";
import { getValorLegalizableAnticipo } from "./valorLegalizableAnticipo";

type CounterKey = "solicitado" | "aprobado_gerencia" | "desembolsado" | "legalizado";

type OwnerProjection = {
  userId?: string;
  email?: string;
  nombre: string;
  rol: string;
};

type CounterContribution = {
  empresa: number;
  fecha: string;
  clave: CounterKey;
  count: number;
  monto: number;
};

const ACTIVE_PHASE_STATES = new Set(["PENDIENTE", "EN_PROGRESO"]);
const TERMINAL_PHASES = new Set(["COMPLETADO", "VI_LEGALIZADO", "RECHAZADO", "ANULADO"]);

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bogotaDateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function empresaDeAnticipo(anticipo: Doc<"anticipos">) {
  return anticipo.empresa_id ?? anticipo.empresa ?? 1;
}

async function getRoleConfig(
  ctx: MutationCtx,
  empresa: number,
  rol: "CONTABILIDAD" | "GERENCIA" | "TESORERO"
) {
  const companyConfig = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa_rol", (q) => q.eq("empresa", empresa).eq("rol", rol))
    .first();
  if (companyConfig) return companyConfig;

  const legacyConfigs = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_rol", (q) => q.eq("rol", rol))
    .take(50);
  return legacyConfigs.find((config) => config.empresa === undefined) ?? null;
}

async function getOwners(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  activePhase: Doc<"anticiposFases"> | null
): Promise<{ owners: OwnerProjection[]; roleRequiresConfig: boolean }> {
  const empresa = empresaDeAnticipo(anticipo);
  const fase = anticipo.faseActual;
  const roleByPhase = {
    III_REVISION_CONTABILIDAD: "CONTABILIDAD",
    IV_APROBACION_GERENCIA: "GERENCIA",
    IV_DESEMBOLSO_TESORERIA: "TESORERO",
  } as const;
  const role = roleByPhase[fase as keyof typeof roleByPhase];

  if (role) {
    const config = await getRoleConfig(ctx, empresa, role);
    if (!config) return { owners: [], roleRequiresConfig: true };
    if (role === "CONTABILIDAD") {
      const usuarios =
        config.usuarios && config.usuarios.length > 0
          ? config.usuarios
          : config.userId
            ? [
                {
                  userId: config.userId,
                  nombre: config.nombre ?? config.userId,
                  email: config.email ?? "",
                },
              ]
            : [];
      return {
        owners: usuarios.map((usuario) => ({
          userId: usuario.userId,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: "Contabilidad",
        })),
        roleRequiresConfig: true,
      };
    }
    return {
      owners: config.userId
        ? [
            {
              userId: config.userId,
              nombre: config.nombre ?? config.userId,
              email: config.email,
              rol: role === "GERENCIA" ? "Gerencia" : "Tesorería",
            },
          ]
        : [],
      roleRequiresConfig: true,
    };
  }

  const assignedUserId = activePhase?.asignadoA ?? anticipo.responsableUserId;
  if (!assignedUserId) return { owners: [], roleRequiresConfig: false };
  return {
    owners: [
      {
        userId: assignedUserId,
        nombre:
          assignedUserId === anticipo.responsableUserId
            ? (anticipo.responsableNombre ?? assignedUserId)
            : assignedUserId,
        email:
          assignedUserId === anticipo.responsableUserId ? anticipo.responsableEmail : undefined,
        rol:
          fase === "II_APROBACION_JEFE_DIRECTO"
            ? "Jefe directo"
            : fase === "V_PENDIENTE_LEGALIZACION"
              ? "Responsable de legalización"
              : "Responsable",
      },
    ],
    roleRequiresConfig: false,
  };
}

function contributionsFromItem(
  item: Doc<"anticiposDashboardItems"> | null
): Map<string, CounterContribution> {
  const result = new Map<string, CounterContribution>();
  if (!item) return result;
  const add = (clave: CounterKey, timestamp: number | undefined, monto: number) => {
    if (!timestamp) return;
    const fecha = bogotaDateKey(timestamp);
    const contribution = { empresa: item.empresa, fecha, clave, count: 1, monto };
    result.set(`${item.empresa}:${fecha}:${clave}`, contribution);
  };

  add("solicitado", item.createdAt, item.valorNumerico);
  add("aprobado_gerencia", item.gerenciaAprobadoEn, item.valorContable);
  add("desembolsado", item.desembolsadoEn, item.valorContable);
  add("legalizado", item.legalizadoEn, item.valorContable);
  return result;
}

async function applyCounterDelta(
  ctx: MutationCtx,
  oldItem: Doc<"anticiposDashboardItems"> | null,
  nextItem: Doc<"anticiposDashboardItems"> | null
) {
  const before = contributionsFromItem(oldItem);
  const after = contributionsFromItem(nextItem);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const now = Date.now();

  for (const key of keys) {
    const previous = before.get(key);
    const next = after.get(key);
    const sample = next ?? previous;
    if (!sample) continue;
    const countDelta = (next?.count ?? 0) - (previous?.count ?? 0);
    const amountDelta = (next?.monto ?? 0) - (previous?.monto ?? 0);
    if (countDelta === 0 && amountDelta === 0) continue;

    const existing = await ctx.db
      .query("anticiposDashboardContadoresDia")
      .withIndex("by_empresa_fecha_clave", (q) =>
        q.eq("empresa", sample.empresa).eq("fecha", sample.fecha).eq("clave", sample.clave)
      )
      .unique();
    const count = Math.max(0, (existing?.count ?? 0) + countDelta);
    const monto = Math.max(0, (existing?.monto ?? 0) + amountDelta);
    if (existing && count === 0 && monto === 0) {
      await ctx.db.delete("anticiposDashboardContadoresDia", existing._id);
    } else if (existing) {
      await ctx.db.patch("anticiposDashboardContadoresDia", existing._id, { count, monto, actualizadoEn: now });
    } else if (count > 0 || monto > 0) {
      await ctx.db.insert("anticiposDashboardContadoresDia", {
        empresa: sample.empresa,
        fecha: sample.fecha,
        clave: sample.clave,
        count,
        monto,
        actualizadoEn: now,
      });
    }
  }
}

async function replaceOwners(
  ctx: MutationCtx,
  item: Doc<"anticiposDashboardItems">,
  owners: OwnerProjection[]
) {
  const existing = await ctx.db
    .query("anticiposDashboardResponsables")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", item.anticipoId))
    .take(50);
  for (const row of existing) await ctx.db.delete("anticiposDashboardResponsables", row._id);
  if (!item.esActiva) return;
  for (const owner of owners) {
    await ctx.db.insert("anticiposDashboardResponsables", {
      anticipoId: item.anticipoId,
      itemId: item._id,
      empresa: item.empresa,
      userId: owner.userId,
      email: owner.email,
      nombre: owner.nombre,
      rol: owner.rol,
      fase: item.faseActual,
      fechaAsignacion: item.faseIniciadaEn,
      valorContable: item.valorContable,
      buzonPrioridad: item.buzonPrioridad,
      buzonOrden: item.buzonOrden,
      esActivo: true,
      actualizadoEn: item.actualizadoEn,
    });
  }
}

export async function refreshAnticipoDashboardProjection(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  now = Date.now()
) {
  const existing = await ctx.db
    .query("anticiposDashboardItems")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
    .unique();
  const anticipo = await ctx.db.get("anticipos", anticipoId);

  if (!anticipo) {
    if (!existing) return null;
    const owners = await ctx.db
      .query("anticiposDashboardResponsables")
      .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
      .take(50);
    for (const owner of owners) await ctx.db.delete("anticiposDashboardResponsables", owner._id);
    await applyCounterDelta(ctx, existing, null);
    await ctx.db.delete("anticiposDashboardItems", existing._id);
    return null;
  }

  const phases = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
    .order("desc")
    .take(30);
  const activePhase =
    phases.find(
      (phase) => phase.fase === anticipo.faseActual && ACTIVE_PHASE_STATES.has(phase.estado)
    ) ??
    phases.find((phase) => ACTIVE_PHASE_STATES.has(phase.estado)) ??
    null;
  const gerenciaPhase = phases.find(
    (phase) => phase.fase === "IV_APROBACION_GERENCIA" && phase.estado === "COMPLETADO"
  );
  const legalizacionPhase = phases.find(
    (phase) => phase.fase === "V_PENDIENTE_LEGALIZACION" && phase.estado === "COMPLETADO"
  );
  const { owners, roleRequiresConfig } = await getOwners(ctx, anticipo, activePhase);
  const integrityIssues: Array<
    "sin_responsable" | "asignacion_inconsistente" | "rol_sin_configurar"
  > = [];
  const esActiva = !TERMINAL_PHASES.has(anticipo.faseActual);
  if (esActiva && owners.length === 0) {
    integrityIssues.push(roleRequiresConfig ? "rol_sin_configurar" : "sin_responsable");
  }
  if (activePhase && activePhase.fase !== anticipo.faseActual) {
    integrityIssues.push("asignacion_inconsistente");
  }

  const valorContable = getValorContableAnticipo(anticipo);
  const valorLegalizable = getValorLegalizableAnticipo(anticipo);
  const saldoLegalizado = Math.max(0, anticipo.saldoLegalizado ?? 0);
  const empresa = empresaDeAnticipo(anticipo);
  const daysToDue = Math.ceil((anticipo.maxLegalizacionDate - now) / 86_400_000);
  const buzonPrioridad =
    anticipo.faseActual === "V_PENDIENTE_LEGALIZACION" && daysToDue < 0
      ? 0
      : anticipo.faseActual === "V_PENDIENTE_LEGALIZACION" && daysToDue <= 7
        ? 1
        : 2;
  const faseIniciadaEn = activePhase?.fechaInicio ?? anticipo.updatedAt;
  const itemValues = {
    anticipoId,
    empresa,
    consecutivo: anticipo.consecutivo,
    razonSocial: anticipo.razonSocial,
    nit: anticipo.nit,
    searchText: normalizeSearchText(
      `${anticipo.consecutivo} ${anticipo.razonSocial} ${anticipo.nit}`
    ),
    valorNumerico: anticipo.valorNumerico,
    valorContable,
    valorLegalizable,
    saldoLegalizado,
    saldoPendiente: Math.max(0, valorLegalizable - saldoLegalizado),
    tipoBolsa: anticipo.tipoBolsa ?? ("general" as const),
    bolsaId: anticipo.bolsaId,
    procesoId: anticipo.procesoId,
    procesoNombre: anticipo.procesoNombre,
    cubreFacturaCompleta:
      anticipo.tipoBolsa === "peajes" ? true : anticipo.cubreFacturaCompleta !== false,
    faseActual: anticipo.faseActual,
    esActiva,
    createdById: anticipo.createdById,
    responsableUserId: anticipo.responsableUserId,
    responsableNombre: anticipo.responsableNombre,
    asignadoA: activePhase?.asignadoA ?? (owners.length === 1 ? owners[0]?.userId : undefined),
    ownerUserIds: owners.flatMap((owner) => (owner.userId ? [owner.userId] : [])),
    faseIniciadaEn,
    createdAt: anticipo.createdAt,
    updatedAt: anticipo.updatedAt,
    maxLegalizacionDate: anticipo.maxLegalizacionDate,
    gerenciaAprobadoEn: gerenciaPhase?.fechaCompletado,
    desembolsadoEn: anticipo.desembolso?.fechaDesembolso,
    legalizadoEn:
      anticipo.faseActual === "COMPLETADO" || anticipo.faseActual === "VI_LEGALIZADO"
        ? (legalizacionPhase?.fechaCompletado ?? anticipo.updatedAt)
        : undefined,
    fueDevuelto: phases.some((phase) => phase.estado === "DEVUELTO"),
    buzonPrioridad,
    buzonOrden: buzonPrioridad < 2 ? anticipo.maxLegalizacionDate : faseIniciadaEn,
    integrityIssues,
    actualizadoEn: now,
  };

  let itemId: Id<"anticiposDashboardItems">;
  if (existing) {
    await ctx.db.patch("anticiposDashboardItems", existing._id, itemValues);
    itemId = existing._id;
  } else {
    itemId = await ctx.db.insert("anticiposDashboardItems", itemValues);
  }
  const item = (await ctx.db.get("anticiposDashboardItems", itemId))!;
  await applyCounterDelta(ctx, existing, item);
  await replaceOwners(ctx, item, owners);
  return itemId;
}
