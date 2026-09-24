import { describe, expect, it } from "vitest";
import { collectHrefs } from "./nav";
import { DEFAULT_RETURN_PATH, safeReturnPath, signInHref } from "./return-path";

const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

const ACCEPTED: Array<[input: string, output: string]> = [
  ["/billing", "/billing"],
  ["/dashboard", "/dashboard"],
  ["/perfil", "/perfil"],
  ["/finance/advances/request", "/finance/advances/request"],
  ["/billing/invoices/k17abc123", "/billing/invoices/k17abc123"],
  ["/finance/advances?anticipo=k17abc", "/finance/advances?anticipo=k17abc"],
  ["/billing/invoices?estado=pendiente&empresa=2", "/billing/invoices?estado=pendiente&empresa=2"],
  ["/billing/invoices?q=ACME%20SAS", "/billing/invoices?q=ACME%20SAS"],
  ["/billing#resumen", "/billing"],
  ["/billing?", "/billing"],
  ["/billing/./inbox", "/billing/inbox"],
  ["/perfil/../billing", "/billing"],
  ["/billing/%2e%2e/perfil", "/perfil"],
];

const REJECTED: Record<string, unknown[]> = {
  "not a usable string": [undefined, null, 42, ["/billing", "/perfil"], "", `/billing/${"a".repeat(600)}`],
  "not a path": [
    "billing",
    "./billing",
    "https://evil.com",
    "http://localhost:3000/billing",
    "javascript:alert(1)",
    "data:text/html,x",
  ],
  "protocol-relative or backslash": [
    "//evil.com",
    "//evil.com/billing",
    "/\\evil.com",
    "\\\\evil.com",
    "/billing\\..\\..\\evil.com",
  ],
  "whitespace, control or non-ASCII": [
    " /billing",
    "/billing ",
    "/\t/evil.com",
    "/billing\n",
    "/bil\u0000ling",
    "/facturación",
    "/billing∕x",
  ],
  "encoded tricks": [
    "/%2F%2Fevil.com",
    "/%2f/evil.com",
    "/%5Cevil.com",
    "/%252F%252Fevil.com",
    "/%09/evil.com",
    "/%E0%A4%A",
    "/billing%2Finbox",
  ],
  "dot segments that collapse into //host": ["/.//evil.com", "/a/..//evil.com", "/billing/..//evil.com", "/billing//x"],
  "not an app page": [
    "/",
    "/sign-in",
    "/sign-up?x=1",
    "/callback?code=abc",
    "/api/me",
    "/onboarding/supplier?token=abc",
    "/billingx",
    "/Billing",
    "/unknown",
  ],
};

describe("safeReturnPath", () => {
  it.each(ACCEPTED)("accepts %s", (input, output) => {
    expect(safeReturnPath(input)).toBe(output);
  });

  for (const [group, values] of Object.entries(REJECTED)) {
    it(`rejects ${group}`, () => {
      for (const value of values) {
        expect(safeReturnPath(value), JSON.stringify(value)).toBeNull();
      }
    });
  }

  it("takes a custom list of allowed pages", () => {
    expect(safeReturnPath("/x/y", ["/x"])).toBe("/x/y");
    expect(safeReturnPath("/billing", ["/x"])).toBeNull();
  });

  it("only ever returns a single-slash, printable-ASCII path", () => {
    for (const [input] of ACCEPTED) {
      const output = safeReturnPath(input) ?? "";
      expect(output.startsWith("/")).toBe(true);
      expect(output.startsWith("//")).toBe(false);
      expect(output).not.toContain("\\");
      expect(output).toMatch(PRINTABLE_ASCII);
      expect(output.length).toBeLessThanOrEqual(512);
    }
  });

  it("defaults to the dashboard", () => {
    expect(DEFAULT_RETURN_PATH).toBe("/dashboard");
    expect(safeReturnPath(DEFAULT_RETURN_PATH)).toBe(DEFAULT_RETURN_PATH);
  });
});

describe("signInHref", () => {
  it("links to the sign-in route, carrying the return path", () => {
    expect(signInHref(null)).toBe("/sign-in");
    const href = signInHref("/billing?estado=a&b=1");
    expect(href).toBe("/sign-in?returnTo=%2Fbilling%3Festado%3Da%26b%3D1");
    expect(new URL(href, "https://example.com").searchParams.get("returnTo")).toBe("/billing?estado=a&b=1");
  });
});

describe("collectHrefs", () => {
  it("lists every nav page once", () => {
    const hrefs = collectHrefs();
    expect(hrefs).toEqual(expect.arrayContaining(["/dashboard", "/billing", "/perfil", "/finance/advances/request"]));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
  });
});
