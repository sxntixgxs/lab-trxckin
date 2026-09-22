import { describe, expect, test } from "vitest";
import {
  diagnoseGraphAccess,
  inspectGraphTokenClaims,
} from "./facturacionGraphDiagnostics";

function fakeJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `hdr.${b64}.sig`;
}

describe("inspectGraphTokenClaims", () => {
  test("lee roles de aplicación Mail.Read", () => {
    const claims = inspectGraphTokenClaims(
      fakeJwt({
        tid: "tenant-1",
        appid: "app-1",
        roles: ["Mail.Read", "User.Read.All"],
      })
    );
    expect(claims).toMatchObject({
      tenantId: "tenant-1",
      appId: "app-1",
      roles: ["Mail.Read", "User.Read.All"],
      delegatedScopes: [],
      hasMailReadApplication: true,
    });
  });

  test("scopes delegados no cuentan como app-only Mail.Read", () => {
    const claims = inspectGraphTokenClaims(
      fakeJwt({
        tid: "tenant-1",
        azp: "app-1",
        scp: "Mail.Read User.Read",
      })
    );
    expect(claims.hasMailReadApplication).toBe(false);
    expect(claims.delegatedScopes).toEqual(["Mail.Read", "User.Read"]);
    expect(claims.appId).toBe("app-1");
  });
});

describe("diagnoseGraphAccess", () => {
  test("sin Mail.Read de aplicación", () => {
    expect(diagnoseGraphAccess({ hasMailReadApplication: false })).toContain(
      "Application permissions"
    );
  });

  test("403 con Mail.Read apunta a access policy", () => {
    expect(
      diagnoseGraphAccess({
        hasMailReadApplication: true,
        mailboxLookupStatus: 403,
      })
    ).toContain("Application Access Policy");
  });

  test("200 en inbox es éxito", () => {
    expect(
      diagnoseGraphAccess({
        hasMailReadApplication: true,
        mailboxLookupStatus: 200,
      })
    ).toContain("debería funcionar");
  });
});
