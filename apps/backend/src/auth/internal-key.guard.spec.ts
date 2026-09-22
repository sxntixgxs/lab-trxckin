import { describe, expect, it } from "vitest";
import { internalKeyMatches } from "./internal-key.guard";

describe("internalKeyMatches", () => {
  it("accepts the exact key", () => {
    expect(internalKeyMatches("secret-key", "secret-key")).toBe(true);
  });

  it("rejects a different key of the same length", () => {
    expect(internalKeyMatches("secret-kez", "secret-key")).toBe(false);
  });

  it("rejects keys of a different length without throwing", () => {
    expect(internalKeyMatches("short", "secret-key")).toBe(false);
    expect(internalKeyMatches("", "secret-key")).toBe(false);
  });
});
