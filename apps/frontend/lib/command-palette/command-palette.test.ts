import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { NAV_ITEMS } from "@/lib/nav";
import { filterCommands } from "./filter";
import { buildNavCommands } from "./nav-commands";
import { rankRecords } from "./rank";
import { readDeepLinkParam, recordHref } from "./record-links";
import { parseRecents, pushRecent, recentsKey, type RecentEntry } from "./recents";
import { isCommandPaletteShortcut, isSlashShortcut, modifierLabel } from "./shortcut";

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcuts", () => {
  it("recognizes Ctrl+K and Cmd+K only", () => {
    assert.equal(isCommandPaletteShortcut(key("k", { ctrlKey: true })), true);
    assert.equal(isCommandPaletteShortcut(key("K", { metaKey: true })), true);
    assert.equal(isCommandPaletteShortcut(key("k")), false);
    assert.equal(isCommandPaletteShortcut(key("k", { ctrlKey: true, shiftKey: true })), false);
    assert.equal(isCommandPaletteShortcut(key("k", { ctrlKey: true, altKey: true })), false);
  });

  it("opens on / only outside editable fields", () => {
    assert.equal(isSlashShortcut(key("/"), { tagName: "BODY" } as EventTarget), true);
    assert.equal(isSlashShortcut(key("/"), { tagName: "INPUT" } as EventTarget), false);
    assert.equal(isSlashShortcut(key("/", { ctrlKey: true }), null), false);
  });

  it("labels the modifier per platform", () => {
    assert.equal(modifierLabel("MacIntel"), "⌘");
    assert.equal(modifierLabel("macOS"), "⌘");
    assert.equal(modifierLabel("Win32"), "Ctrl");
    assert.equal(modifierLabel(""), "Ctrl");
  });
});

describe("buildNavCommands", () => {
  it("filters by permission and uses Spanish labels", () => {
    const allowed = new Set(["billing/invoices", "perfil"]);
    const commands = buildNavCommands(NAV_ITEMS, (p) => !p || allowed.has(p));
    const labels = commands.map((c) => c.label);
    assert.ok(labels.includes("Facturas"));
    assert.ok(labels.includes("Perfil"));
    assert.ok(labels.includes("Cargar facturas"), "extra page gated by billing/invoices");
    assert.ok(!labels.includes("Anticipos"));
    assert.ok(!labels.includes("Usuarios"));
    const facturas = commands.find((c) => c.href === "/billing/invoices");
    assert.ok(facturas?.keywords.includes("Invoices"), "keeps the English label as keyword");
  });

  it("hides extra pages without permission and dedupes hrefs", () => {
    const commands = buildNavCommands(NAV_ITEMS, () => true);
    const hrefs = commands.map((c) => c.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
    const none = buildNavCommands(NAV_ITEMS, (p) => !p);
    assert.equal(none.length, 0);
  });
});

describe("filterCommands", () => {
  const commands = [
    { label: "Configuración de facturación", keywords: ["Settings"] },
    { label: "Facturas", keywords: ["Invoices"] },
    { label: "Anticipos", keywords: ["Advances"] },
  ];

  it("matches without accents and puts prefix matches first", () => {
    const result = filterCommands(commands, "facturacion").map((c) => c.label);
    assert.deepEqual(result, ["Configuración de facturación"]);
    const fac = filterCommands(commands, "fact").map((c) => c.label);
    assert.deepEqual(fac, ["Facturas", "Configuración de facturación"]);
  });

  it("matches keywords and returns everything for an empty query", () => {
    assert.deepEqual(filterCommands(commands, "advances").map((c) => c.label), ["Anticipos"]);
    assert.equal(filterCommands(commands, "  ").length, 3);
  });
});

describe("rankRecords", () => {
  const rows = [
    { id: "a", ids: ["FE-12345"], text: "Transportes FE", active: true },
    { id: "b", ids: ["FE-123"], text: "Otro", active: false },
    { id: "c", ids: ["FE-123"], text: "Activo", active: true },
    { id: "d", ids: ["X-1"], text: "Contiene fe-123 en el nombre", active: true },
  ];

  it("orders exact id, prefix, text, and active first on ties", () => {
    const ranked = rankRecords("fe-123", rows, (r) => r).map((r) => r.id);
    assert.deepEqual(ranked, ["c", "b", "a", "d"]);
  });

  it("ignores dots and dashes in identifiers (NITs)", () => {
    const nits = [
      { id: "x", ids: ["900123"], text: "" },
      { id: "y", ids: ["900123456"], text: "" },
    ];
    assert.deepEqual(rankRecords("900.123.456", nits, (r) => r).map((r) => r.id), ["y", "x"]);
  });
});

describe("recents", () => {
  const entry = (id: string, at = 1): RecentEntry => ({
    kind: "page",
    id,
    label: id,
    href: `/${id}`,
    at,
  });

  it("dedupes, puts newest first and caps", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 8; i++) list = pushRecent(list, entry(`p${i}`, i));
    list = pushRecent(list, entry("p5", 99));
    assert.equal(list.length, 6);
    assert.equal(list[0]?.id, "p5");
    assert.equal(list.filter((e) => e.id === "p5").length, 1);
  });

  it("parses stored data defensively", () => {
    assert.deepEqual(parseRecents(null), []);
    assert.deepEqual(parseRecents("{nope"), []);
    assert.deepEqual(parseRecents(JSON.stringify({ a: 1 })), []);
    const stored = [entry("ok"), { kind: "evil", id: "x" }, { ...entry("ext"), href: "https://x" }];
    assert.deepEqual(parseRecents(JSON.stringify(stored)).map((e) => e.id), ["ok"]);
  });

  it("scopes the storage key by user", () => {
    assert.notEqual(recentsKey("admin"), recentsKey("user"));
  });
});

describe("record links", () => {
  it("builds hrefs per kind", () => {
    assert.equal(recordHref("factura", { id: "abc" }), "/billing/invoices/abc");
    assert.equal(recordHref("anticipo", { id: "abc" }), "/finance/advances?anticipo=abc");
    assert.equal(recordHref("proveedor", { id: "abc" }), "/suppliers/onboarding?inscripcion=abc");
    assert.equal(recordHref("cliente", { id: "abc" }), "/customers/onboarding?inscripcion=abc");
    assert.equal(
      recordHref("centroCosto", { id: "x", empresa: 2, codigo: "CC 10&1" }),
      "/administracion/centro-costo?empresa=2&q=CC+10%261",
    );
  });

  it("reads and strips a deep-link param", () => {
    const { value, rest } = readDeepLinkParam(new URLSearchParams("anticipo=k1&tab=x"), "anticipo");
    assert.equal(value, "k1");
    assert.equal(rest.toString(), "tab=x");
    assert.equal(readDeepLinkParam(new URLSearchParams("anticipo="), "anticipo").value, null);
  });
});
