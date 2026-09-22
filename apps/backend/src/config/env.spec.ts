import { describe, expect, it } from "vitest";
import { findMissingEnv, validateEnv } from "./env";

const complete = {
  DATABASE_URL: "postgresql://x",
  WORKOS_CLIENT_ID: "client_x",
  WORKOS_API_KEY: "sk_x",
  NEST_INTERNAL_KEY: "k",
};

describe("validateEnv", () => {
  it("passes when every required variable is set", () => {
    expect(findMissingEnv(complete)).toEqual([]);
    expect(() => validateEnv(complete)).not.toThrow();
  });

  it("lists blank or missing variables", () => {
    expect(findMissingEnv({ ...complete, WORKOS_API_KEY: " ", NEST_INTERNAL_KEY: undefined })).toEqual([
      "WORKOS_API_KEY",
      "NEST_INTERNAL_KEY",
    ]);
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
