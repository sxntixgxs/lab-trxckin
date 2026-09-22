import type { CUSTOMER_MONTO_OPTIONS, CUSTOMER_SECTOR_OPTIONS } from "@/lib/onboarding/risk/customer-matrix";
import type { JURISDICCION_NACIONAL_OPTIONS } from "@/lib/onboarding/risk/shared";
import type { SUPPLIER_MONTO_OPTIONS, SUPPLIER_SECTOR_OPTIONS } from "@/lib/onboarding/risk/supplier-matrix";

/**
 * Fictional ACME company behind the "Completar con ACME" buttons of the supplier and customer
 * start modals. Every risk factor scores 1, so the process starts as BAJO / SOLO LISTAS, the
 * path with the fewest required documents. The NIT is fixed because the public form asks for it
 * before letting the third party in. The emails are Resend test inboxes: invitations count as
 * delivered without reaching a real mailbox or bouncing.
 */
export const ACME_DEMO = {
  razonSocial: "ACME Colombia S.A.S.",
  nit: "900123456",
  direccion: "Carrera 27 # 36-14, Oficina 502",
  ciudad: "Bucaramanga",
  departamento: "Santander",
  jurisdiccionNacional: "Santander" satisfies (typeof JURISDICCION_NACIONAL_OPTIONS)[number],
  contactoNombre: "Laura Gómez",
  contactoEmail: "delivered+acme-contacto@resend.dev",
  contactoCelular: "3001234567",
  representanteLegalNombre: "Carlos Rodríguez",
  representanteLegalDocumento: "1098765432",
  representanteLegalEmail: "delivered+acme-representante@resend.dev",
  /** Fabricación de otros productos elaborados de metal n.c.p. */
  codigoCiiu: "2599",
  /** Comercio al por mayor de materiales de construcción y artículos de ferretería. */
  codigoCiiuSecundario: "4663",
} as const;

/** ACME as a supplier of the group company. */
export const ACME_DEMO_PROVEEDOR = {
  servicioSuministrado: "Suministro de insumos metalmecánicos y artículos de ferretería",
  montoAnual: "Menor a 10 millones COP" satisfies (typeof SUPPLIER_MONTO_OPTIONS)[number],
  sectorEconomico: "Proveedores materias primas e insumos" satisfies (typeof SUPPLIER_SECTOR_OPTIONS)[number],
} as const;

/** ACME as a customer of the group company. */
export const ACME_DEMO_CLIENTE = {
  servicioSuministrado: "Venta de materiales de construcción",
  montoAnual: "Ventas Comerciales Menor a 10 millones" satisfies (typeof CUSTOMER_MONTO_OPTIONS)[number],
  sectorEconomico: "Privados: Otros" satisfies (typeof CUSTOMER_SECTOR_OPTIONS)[number],
} as const;

/**
 * Returns `current` with its empty fields taken from `demo`, so whatever was typed or read from
 * the RUT is kept. Fields in one group (a CIIU code and its activity, the two exclusive
 * jurisdictions) are filled together, and only when all of them are empty.
 */
export function fillEmptyFields<T extends object>(current: T, demo: T, groups: readonly (readonly (keyof T)[])[] = []): T {
  const isEmpty = (key: keyof T) => {
    const value: unknown = current[key];
    return typeof value === "string" ? value.trim() === "" : value === undefined;
  };
  const grouped = new Set<keyof T>(groups.flat());
  const singles = (Object.keys(demo) as (keyof T)[]).filter((key) => !grouped.has(key)).map((key) => [key]);
  const result = { ...current };
  for (const group of [...groups, ...singles]) {
    if (group.every(isEmpty)) for (const key of group) result[key] = demo[key];
  }
  return result;
}
