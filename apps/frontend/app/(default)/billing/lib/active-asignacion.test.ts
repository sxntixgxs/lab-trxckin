import { describe, expect, test } from "vitest";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { resolveActiveAsignacion } from "./active-asignacion";

function asignacion(
  args: Partial<Doc<"facturacionAsignaciones">> &
    Pick<
      Doc<"facturacionAsignaciones">,
      "_id" | "tareaId" | "fase" | "estado" | "grupoId" | "creadoEn"
    >
): Doc<"facturacionAsignaciones"> {
  return {
    _creationTime: 0,
    facturaId: "factura" as Id<"facturacionFacturas">,
    empresa: 1,
    rol: "lider",
    asignadoANombre: "Líder",
    asignadoAEmail: "lider@example.com",
    fechaAsignacion: args.creadoEn,
    actualizadoEn: args.creadoEn,
    ...args,
  };
}

function tarea(
  args: Partial<Doc<"facturacionTareas">> &
    Pick<Doc<"facturacionTareas">, "_id" | "estado">
): Doc<"facturacionTareas"> {
  return {
    _creationTime: 0,
    facturaId: "factura" as Id<"facturacionFacturas">,
    empresa: 1,
    categoria: "administracion",
    asignadoANombre: "Asignado",
    asignadoAEmail: "asignado@example.com",
    liderProcesoNombre: "Líder",
    liderProcesoEmail: "lider@example.com",
    creadoEn: 1,
    actualizadoEn: 1,
    ...args,
  };
}

describe("resolveActiveAsignacion", () => {
  test("prefiere asignación pendiente cuando currentAsignacionId está completada", () => {
    const tareaId = "tarea" as Id<"facturacionTareas">;
    const grupoId = "grupo-1";
    const completada = asignacion({
      _id: "completed" as Id<"facturacionAsignaciones">,
      tareaId,
      fase: "revision_lider",
      estado: "completada",
      grupoId,
      creadoEn: 1,
      asignadoAUserId: "juan",
    });
    const pendiente = asignacion({
      _id: "pending" as Id<"facturacionAsignaciones">,
      tareaId,
      fase: "revision_lider",
      estado: "pendiente",
      grupoId,
      creadoEn: 2,
      asignadoAUserId: "nicolas",
    });

    const resolved = resolveActiveAsignacion({
      asignaciones: [completada, pendiente],
      tarea: tarea({
        _id: tareaId,
        estado: "revision_lider",
        currentAsignacionId: completada._id,
        grupoAsignacionActualId: grupoId,
      }),
    });

    expect(resolved?._id).toBe(pendiente._id);
  });

  test("prefiere asignación pendiente del actor actual", () => {
    const tareaId = "tarea" as Id<"facturacionTareas">;
    const grupoId = "grupo-1";
    const pendienteActor = asignacion({
      _id: "actor" as Id<"facturacionAsignaciones">,
      tareaId,
      fase: "revision_lider",
      estado: "pendiente",
      grupoId,
      creadoEn: 2,
      asignadoAUserId: "nicolas",
      asignadoAEmail: "nicolas@example.com",
    });
    const pendienteOtro = asignacion({
      _id: "other" as Id<"facturacionAsignaciones">,
      tareaId,
      fase: "revision_lider",
      estado: "pendiente",
      grupoId,
      creadoEn: 1,
      asignadoAUserId: "juan",
      asignadoAEmail: "juan@example.com",
    });

    const resolved = resolveActiveAsignacion({
      asignaciones: [pendienteOtro, pendienteActor],
      tarea: tarea({
        _id: tareaId,
        estado: "revision_lider",
        grupoAsignacionActualId: grupoId,
      }),
      actorUserId: "nicolas",
    });

    expect(resolved?._id).toBe(pendienteActor._id);
  });
});
