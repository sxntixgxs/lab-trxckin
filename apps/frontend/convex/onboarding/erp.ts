// Registro del tercero en el ERP desde la última fase ("Crear en ERP").
// Lo usa el BFF de Next (app/api/erp/terceros): lee los datos con el token del usuario, llama al
// backend y, si el ERP registró el tercero, lo anota aquí con el secreto de servidor.
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireServerSecret } from "../lib/auth";
import { requireActorEnFase } from "../lib/onboarding/access";
import { esSupplierDoc, requireInscripcion, resolveRef, type OnboardingModulo } from "../lib/onboarding/refs";
import { moduloValidator, registroErpValidator } from "./validators";

/** Fase en la que Contabilidad crea el tercero en el sistema contable. */
const FASE_CREACION: Record<OnboardingModulo, string> = {
  supplier: "VI_CREACION_CONTABILIDAD",
  customer: "IV_CREACION_CONTABILIDAD",
};

async function requireFaseCreacion(ctx: QueryCtx | MutationCtx, modulo: OnboardingModulo, inscripcionId: string) {
  const ins = await requireInscripcion(ctx, resolveRef(ctx, modulo, inscripcionId));
  const fase = FASE_CREACION[modulo];
  // requireActorEnFase deja pasar a los administradores en cualquier fase: la fase se valida aparte.
  if (ins.faseActual !== fase) {
    throw new Error("La inscripción no está en la fase de creación en el sistema contable.");
  }
  const actor = await requireActorEnFase(ctx, modulo, ins, fase);
  return { ins, actor };
}

function primerTexto(...valores: Array<string | undefined>): string | undefined {
  return valores.map((valor) => valor?.trim()).find((valor): valor is string => Boolean(valor));
}

/** Datos del tercero para registrarlo en el ERP. Solo para quien atiende la fase de creación. */
export const datosParaCrearEnErp = query({
  args: { modulo: moduloValidator, inscripcionId: v.string() },
  handler: async (ctx, args) => {
    const { ins } = await requireFaseCreacion(ctx, args.modulo, args.inscripcionId);
    const d = ins.datos_generales_01;
    const codigoCiiu = esSupplierDoc(ins) ? ins.actividadPrincipal_02?.codigoCiiu : ins.actividadEconomica_02?.codigoCiiu;
    return {
      entidad: args.modulo === "supplier" ? ("PROVEEDOR" as const) : ("CLIENTE" as const),
      empresa: ins.empresa,
      tipoDocumento: d.tipoDocumento,
      numeroDocumento: d.numeroDocumento,
      tipoPersona: d.tipoPersona,
      razonSocial: d.razonSocial,
      email: primerTexto(d.email, d.contactoEmail),
      telefono: primerTexto(d.telefono, d.celular, d.contactoCelular),
      direccion: primerTexto(d.direccion),
      ciudad: primerTexto(d.ciudad),
      departamento: primerTexto(d.departamento),
      codigoCiiu: primerTexto(codigoCiiu),
      formaPago: ins.condicionesPago_12?.formaPago,
      plazo: ins.condicionesPago_12?.plazo,
      registroErp: ins.registroErp ?? null,
    };
  },
});

/**
 * Anota que el tercero quedó registrado en el ERP. Solo la llama el servidor (secreto) en nombre
 * de quien atiende la fase. Idempotente: un reintento devuelve el registro existente y solo
 * puede pasar `catalogoActualizado` de false a true.
 */
export const registrarCreacionEnErp = mutation({
  args: {
    modulo: moduloValidator,
    inscripcionId: v.string(),
    erpTerceroId: v.string(),
    sucursalId: v.string(),
    accion: v.union(v.literal("CREADO"), v.literal("ACTUALIZADO")),
    catalogoActualizado: v.boolean(),
    secret: v.string(),
  },
  returns: registroErpValidator,
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const { ins, actor } = await requireFaseCreacion(ctx, args.modulo, args.inscripcionId);
    const previo = ins.registroErp;
    if (previo && (previo.catalogoActualizado || !args.catalogoActualizado)) return previo;

    const registro = previo
      ? { ...previo, catalogoActualizado: true }
      : {
          erpTerceroId: args.erpTerceroId.trim().slice(0, 40),
          sucursalId: args.sucursalId.trim().slice(0, 10),
          accion: args.accion,
          catalogoActualizado: args.catalogoActualizado,
          fecha: Date.now(),
          porUserId: actor.usuarioId,
        };
    if (args.modulo === "supplier") {
      await ctx.db.patch("onboardingProveedores", ins._id as Id<"onboardingProveedores">, { registroErp: registro });
    } else {
      await ctx.db.patch("onboardingClientes", ins._id as Id<"onboardingClientes">, { registroErp: registro });
    }
    return registro;
  },
});
