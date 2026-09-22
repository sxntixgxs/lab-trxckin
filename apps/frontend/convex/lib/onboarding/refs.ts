import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export type OnboardingModulo = "supplier" | "customer";

export type SupplierRef = { modulo: "supplier"; inscripcionId: Id<"onboardingProveedores"> };
export type CustomerRef = { modulo: "customer"; inscripcionId: Id<"onboardingClientes"> };
export type InscripcionRef = SupplierRef | CustomerRef;

export type SupplierDoc = Doc<"onboardingProveedores">;
export type CustomerDoc = Doc<"onboardingClientes">;
export type InscripcionDoc = SupplierDoc | CustomerDoc;

export type InscripcionIdDe<M extends OnboardingModulo> = M extends "supplier"
  ? Id<"onboardingProveedores">
  : Id<"onboardingClientes">;
export type InscripcionDocDe<M extends OnboardingModulo> = M extends "supplier" ? SupplierDoc : CustomerDoc;

export const MODULO_LABEL: Record<OnboardingModulo, string> = {
  supplier: "proveedor",
  customer: "cliente",
};

export function refFromDoc(modulo: "supplier", ins: SupplierDoc): SupplierRef;
export function refFromDoc(modulo: "customer", ins: CustomerDoc): CustomerRef;
export function refFromDoc(modulo: OnboardingModulo, ins: InscripcionDoc): InscripcionRef;
export function refFromDoc(modulo: OnboardingModulo, ins: InscripcionDoc): InscripcionRef {
  return modulo === "supplier"
    ? { modulo: "supplier", inscripcionId: ins._id as Id<"onboardingProveedores"> }
    : { modulo: "customer", inscripcionId: ins._id as Id<"onboardingClientes"> };
}

export async function getInscripcion(ctx: QueryCtx | MutationCtx, ref: InscripcionRef): Promise<InscripcionDoc | null> {
  if (ref.modulo === "supplier") {
    return await ctx.db.get("onboardingProveedores", ref.inscripcionId);
  }
  return await ctx.db.get("onboardingClientes", ref.inscripcionId);
}

export async function requireInscripcion(ctx: QueryCtx | MutationCtx, ref: InscripcionRef): Promise<InscripcionDoc> {
  const ins = await getInscripcion(ctx, ref);
  if (!ins) throw new Error("Inscripción no encontrada.");
  return ins;
}

export function esSupplierDoc(ins: InscripcionDoc): ins is SupplierDoc {
  return "tipoEvaluacion_14" in ins;
}

export function normalizeNumeroDocumento(value: string | undefined | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function tipoEvaluacionDe(ins: InscripcionDoc): string {
  return esSupplierDoc(ins) ? ins.tipoEvaluacion_14 : ins.tipoEvaluacion;
}

export function documentosCargadosDe(ins: InscripcionDoc): Record<string, Id<"_storage">> {
  return (esSupplierDoc(ins) ? ins.documentos_15 : ins.documentos_09) ?? {};
}

export function firmaDe(ins: InscripcionDoc): string | undefined {
  return esSupplierDoc(ins) ? ins.firmaRepresentante_16 : ins.firmaRepresentante_10;
}

/** Identidad del tercero tal como la usan correos, PDFs y el formulario. */
export function identidadDe(ins: InscripcionDoc): {
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoSolicitud?: "INSCRIPCIÓN" | "ACTUALIZACIÓN";
} {
  const d = ins.datos_generales_01;
  return {
    razonSocial: d.razonSocial,
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.numeroDocumento,
    tipoSolicitud: d.tipoSolicitud,
  };
}

export type Destinatario = { nombre: string; email: string };

/** Destinatario del enlace al formulario (contacto principal del tercero). */
export function contactoFormularioDe(ins: InscripcionDoc): Destinatario | null {
  const d = ins.datos_generales_01;
  if (esSupplierDoc(ins)) {
    const email = ins.datos_generales_01.contactoEmail?.trim();
    return email ? { nombre: ins.datos_generales_01.contactoNombre || d.razonSocial, email } : null;
  }
  const email = (d.contactoEmail ?? d.representanteLegalEmail ?? d.email ?? "").trim();
  if (!email) return null;
  const nombre = d.contactoNombre?.trim() || d.representanteLegalNombre?.trim() || d.razonSocial;
  return { nombre, email };
}

/** Destinatario del enlace de firma (representante legal, con respaldo en el contacto). */
export function contactoFirmaDe(ins: InscripcionDoc): Destinatario | null {
  const d = ins.datos_generales_01;
  const email = d.representanteLegalEmail?.trim();
  if (email) return { nombre: d.representanteLegalNombre?.trim() || "Representante Legal", email };
  return null;
}

/** Cualquier correo del tercero para avisos generales (contacto, luego RL). */
export function contactoTerceroDe(ins: InscripcionDoc): Destinatario | null {
  return contactoFormularioDe(ins) ?? contactoFirmaDe(ins);
}

/** Convierte un id recibido como string en la referencia tipada del módulo (o lanza). */
export function resolveRef(ctx: QueryCtx | MutationCtx, modulo: OnboardingModulo, inscripcionId: string): InscripcionRef {
  if (modulo === "supplier") {
    const id = ctx.db.normalizeId("onboardingProveedores", inscripcionId);
    if (!id) throw new Error("Inscripción no encontrada.");
    return { modulo: "supplier", inscripcionId: id };
  }
  const id = ctx.db.normalizeId("onboardingClientes", inscripcionId);
  if (!id) throw new Error("Inscripción no encontrada.");
  return { modulo: "customer", inscripcionId: id };
}
