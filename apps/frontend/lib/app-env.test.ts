import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessRequestUrl } from "./app-env";

const VAR = "NEXT_PUBLIC_ACCESS_REQUEST_URL";
const LINKEDIN = "https://www.linkedin.com/in/santiagosandovalt/";

describe("getAccessRequestUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when the variable is unset or blank", () => {
    vi.stubEnv(VAR, undefined);
    expect(getAccessRequestUrl()).toBeNull();
    for (const value of ["", "   "]) {
      vi.stubEnv(VAR, value);
      expect(getAccessRequestUrl()).toBeNull();
    }
  });

  it("returns an https URL, trimmed and normalized", () => {
    vi.stubEnv(VAR, LINKEDIN);
    expect(getAccessRequestUrl()).toBe(LINKEDIN);
    vi.stubEnv(VAR, `  ${LINKEDIN}\n`);
    expect(getAccessRequestUrl()).toBe(LINKEDIN);
    vi.stubEnv(VAR, "https://example.com");
    expect(getAccessRequestUrl()).toBe("https://example.com/");
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "mailto:me@example.com",
    "data:text/html,x",
    "//example.com",
    "www.linkedin.com/in/x",
    "not a url",
    "https://user:pass@example.com/",
  ])("rejects %s", (value) => {
    vi.stubEnv(VAR, value);
    expect(getAccessRequestUrl()).toBeNull();
  });
});
