import { describe, expect, test } from "vitest";

import { resolveAnticipoResponsible } from "./responsable-routing";

const currentUser = { id: "requester", nombre: "Solicitante" };
const configuredBoss = { id: "boss", nombre: "Jefe configurado" };
const alternativeLeader = { id: "leader", nombre: "Líder alternativo" };

describe("anticipos request responsible routing", () => {
  test("marks the configured boss as jefe_directo", () => {
    expect(
      resolveAnticipoResponsible({
        currentUser,
        configuredBoss,
        selectedLeader: configuredBoss,
        omitBossApproval: false,
      })
    ).toEqual({ responsible: configuredBoss, origin: "jefe_directo" });
  });

  test("marks an alternative active leader as manual", () => {
    expect(
      resolveAnticipoResponsible({
        currentUser,
        configuredBoss,
        selectedLeader: alternativeLeader,
        omitBossApproval: false,
      })
    ).toEqual({ responsible: alternativeLeader, origin: "manual" });
  });

  test("keeps the requester responsible when approval is omitted", () => {
    expect(
      resolveAnticipoResponsible({
        currentUser,
        configuredBoss,
        selectedLeader: configuredBoss,
        omitBossApproval: true,
      })
    ).toEqual({ responsible: currentUser, origin: "solicitante" });
  });

  test("preserves the direct route for a user without configured boss", () => {
    expect(
      resolveAnticipoResponsible({
        currentUser,
        omitBossApproval: true,
      })
    ).toEqual({ responsible: currentUser, origin: "solicitante" });
  });
});
