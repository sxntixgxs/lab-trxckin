import { describe, expect, it } from "vitest";
import { secretoCoincide } from "./conni.guard";

describe("secretoCoincide", () => {
  it("matches only identical secrets", () => {
    expect(secretoCoincide("abc123", "abc123")).toBe(true);
    expect(secretoCoincide("abc124", "abc123")).toBe(false);
    expect(secretoCoincide("abc", "abc123")).toBe(false);
    expect(secretoCoincide("", "abc123")).toBe(false);
  });
});
