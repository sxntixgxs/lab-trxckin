/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { toConvexPrivileges } from "../lib/convex-privileges";
import type { CurrentUser } from "../lib/fetch-backend";
import { api } from "./_generated/api";
import { requireActor } from "./lib/billingAuth";
import { actorEsAsignado } from "./lib/facturacionAccess";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const secret = "test-convex-server-secret";
const identity = {
  tokenIdentifier: "test|real-admin",
  subject: "workos-real-admin",
  email: "real-admin@example.com",
  name: "Real Admin",
};

function profile(id: string, email: string): CurrentUser {
  return {
    id,
    workosUserId: `workos-${id}`,
    email,
    nombre: id,
    activo: true,
    rol: { id: 2, slug: "member", nombre: "Member" },
    permisos: ["billing/inbox"],
    hasFullAccess: false,
    empresas: [1],
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  const client = t.withIdentity(identity);
  const userId = await client.mutation(api.users.store, {});
  const sync = (user: CurrentUser) =>
    client.mutation(api.users.syncPrivileges, {
      secret,
      workosUserId: identity.subject,
      ...toConvexPrivileges(user),
    });
  return { t, client, userId, sync };
}

describe("trusted effective actor email", () => {
  test("uses the acting user's email for assignments and keeps the WorkOS email separate", async () => {
    const { t, client, userId, sync } = await setup();
    await sync(profile("acting-member", " Acting.Member@Example.com "));
    const actor = await client.run(requireActor);

    expect(actor).toMatchObject({ usuarioId: "acting-member", email: "acting.member@example.com" });
    expect(actorEsAsignado(actor, { asignadoAEmail: "acting.member@example.com" })).toBe(true);
    expect(actorEsAsignado(actor, { asignadoAEmail: identity.email })).toBe(false);
    expect(actorEsAsignado(actor, { asignadoAUserId: "someone-else", asignadoAEmail: identity.email })).toBe(false);

    // Public identity refresh cannot overwrite the trusted acting profile.
    await client.mutation(api.users.store, {});
    const row = await t.run((ctx) => ctx.db.get("users", userId));
    expect(row).toMatchObject({ email: identity.email, actorEmail: "acting.member@example.com" });
    expect((await client.run(requireActor)).email).toBe("acting.member@example.com");
  });

  test("resync replaces the former actor email when changing or leaving impersonation", async () => {
    const { client, sync } = await setup();
    await sync(profile("first-target", "first@example.com"));
    await sync(profile("second-target", "second@example.com"));
    let actor = await client.run(requireActor);
    expect(actorEsAsignado(actor, { asignadoAEmail: "first@example.com" })).toBe(false);
    expect(actorEsAsignado(actor, { asignadoAEmail: "second@example.com" })).toBe(true);

    await sync(profile("real-admin", identity.email));
    actor = await client.run(requireActor);
    expect(actorEsAsignado(actor, { asignadoAEmail: "second@example.com" })).toBe(false);
    expect(actorEsAsignado(actor, { asignadoAEmail: identity.email })).toBe(true);
  });

  test("older sync callers clear stale email and legacy rows retain only ID-based access until resync", async () => {
    const { client, sync } = await setup();
    await sync(profile("first-target", "first@example.com"));
    await client.mutation(api.users.syncPrivileges, {
      secret,
      workosUserId: identity.subject,
      nestUserId: "legacy-target",
      role: "member",
      permisos: [],
      hasFullAccess: false,
    });
    const actor = await client.run(requireActor);
    expect(actor.email).toBe("");
    expect(actorEsAsignado(actor, { asignadoAEmail: "first@example.com" })).toBe(false);
    expect(actorEsAsignado(actor, { asignadoAEmail: identity.email })).toBe(false);
    expect(actorEsAsignado(actor, { asignadoAUserId: "legacy-target" })).toBe(true);

    await sync(profile("legacy-target", "legacy@example.com"));
    expect(actorEsAsignado(await client.run(requireActor), { asignadoAEmail: "legacy@example.com" })).toBe(true);
  });

  test("an untrusted caller cannot choose the effective actor email", async () => {
    const { client, sync } = await setup();
    await sync(profile("acting-member", "member@example.com"));
    await expect(client.mutation(api.users.syncPrivileges, {
      secret: "forged",
      workosUserId: identity.subject,
      ...toConvexPrivileges(profile("acting-member", identity.email)),
    })).rejects.toThrow("No autorizado");
    expect((await client.run(requireActor)).email).toBe("member@example.com");
  });
});
