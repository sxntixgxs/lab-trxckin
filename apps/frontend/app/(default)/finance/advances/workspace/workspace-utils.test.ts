import { describe, expect, test } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { AnticipoRoleConfig, AnticipoRow, UsuarioInfo } from "../dashboard/types";
import {
  canAccessAnticiposSettings,
  getInboxQuickFilterPatch,
  getPendingLegalizationBalance,
  isInboxQuickFilterActive,
  resolveAnticipoAssigneeName,
  resolveUserDisplayName,
} from "./workspace-utils";

function advance(overrides: Partial<AnticipoRow> = {}) {
  return {
    _id: "anticipo-1" as Id<"anticipos">,
    faseActual: "II_APROBACION_JEFE_DIRECTO",
    responsableUserId: "responsable-1",
    responsableNombre: "Responsable guardado",
    faseEnCurso: null,
    valorNumerico: 100_000,
    valorContable: 90_000,
    saldoLegalizado: 35_000,
    ...overrides,
  } as AnticipoRow;
}

describe("anticipos workspace utilities", () => {
  test("resolves assignment names without exposing opaque identifiers", () => {
    const users = new Map<string, UsuarioInfo>([
      [
        "a6c44ecd-57d7-405b-9665-9fbeb1",
        { id: "a6c44ecd-57d7-405b-9665-9fbeb1", nombre: "Wilson Mosos" },
      ],
    ]);

    expect(
      resolveAnticipoAssigneeName(
        advance({
          faseEnCurso: {
            asignadoA: "a6c44ecd-57d7-405b-9665-9fbeb1",
          } as AnticipoRow["faseEnCurso"],
        }),
        users,
        []
      )
    ).toBe("Wilson Mosos");
    expect(resolveUserDisplayName("missing-id", users)).toBe("Usuario no disponible");
    expect(
      resolveUserDisplayName("missing-id", users, "a6c44ecd-57d7-405b-9665-9fbeb1000000")
    ).toBe("Usuario no disponible");
    expect(
      resolveAnticipoAssigneeName(
        advance({
          responsableNombre: undefined,
          faseEnCurso: { asignadoA: "missing-id" } as AnticipoRow["faseEnCurso"],
        }),
        users,
        []
      )
    ).toBe("Jefe directo");
  });

  test("activates Por legalizar while clearing incompatible urgency filters", () => {
    expect(getInboxQuickFilterPatch("legalization")).toEqual({
      phase: "V_PENDIENTE_LEGALIZACION",
      urgency: "all",
    });
    expect(getInboxQuickFilterPatch("overdue")).toEqual({
      phase: undefined,
      urgency: "overdue",
    });
    expect(
      isInboxQuickFilterActive(
        {
          search: "",
          mode: "backlog",
          preset: "mes_actual",
          phase: "V_PENDIENTE_LEGALIZACION",
          urgency: "all",
        },
        "legalization"
      )
    ).toBe(true);
  });

  test("calculates the real pending legalization balance", () => {
    expect(getPendingLegalizationBalance(advance())).toBe(55_000);
  });

  test("uses valorLegalizableActual when it differs from valorContable", () => {
    expect(
      getPendingLegalizationBalance(
        advance({
          faseActual: "V_PENDIENTE_LEGALIZACION",
          valorContable: 2_063_470,
          valorLegalizableActual: 2_063_468,
          saldoLegalizado: 2_063_468,
        })
      )
    ).toBe(0);
    expect(
      getPendingLegalizationBalance(
        advance({
          faseActual: "V_PENDIENTE_LEGALIZACION",
          valorContable: 2_063_470,
          valorLegalizableActual: 2_063_470,
          saldoLegalizado: 2_063_468,
        })
      )
    ).toBe(2);
  });

  test("limits settings to administrators and configured gerencia for the active company", () => {
    const roles = [
      { rol: "GERENCIA", empresa: 1, userId: "gerente-empresa-1" },
      { rol: "GERENCIA", userId: "gerente-global" },
    ] as AnticipoRoleConfig[];

    expect(canAccessAnticiposSettings({ roleId: 1, empresa: null })).toBe(true);
    expect(
      canAccessAnticiposSettings({
        userId: "gerente-empresa-1",
        roleId: 2,
        empresa: 1,
        roles,
      })
    ).toBe(true);
    expect(
      canAccessAnticiposSettings({
        userId: "gerente-empresa-1",
        roleId: 2,
        empresa: 2,
        roles,
      })
    ).toBe(false);
    expect(
      canAccessAnticiposSettings({
        userId: "gerente-global",
        roleId: 2,
        empresa: 2,
        roles,
      })
    ).toBe(true);
  });
});
