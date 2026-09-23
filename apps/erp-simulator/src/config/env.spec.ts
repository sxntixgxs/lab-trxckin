import { describe, expect, it } from "vitest";
import { findMissingEnv, validateEnv } from "./env";

const complete = {
  ERP_SIM_DATABASE_URL: "postgresql://x",
  ERP_SIM_CONNI_KEY: "k",
  ERP_SIM_CONNI_TOKEN: "t",
};

describe("validateEnv", () => {
  it("passes when every required variable is set", () => {
    expect(findMissingEnv(complete)).toEqual([]);
    expect(() => validateEnv(complete)).not.toThrow();
  });

  it("lists blank or missing variables", () => {
    expect(findMissingEnv({ ...complete, ERP_SIM_CONNI_KEY: " ", ERP_SIM_CONNI_TOKEN: undefined })).toEqual([
      "ERP_SIM_CONNI_KEY",
      "ERP_SIM_CONNI_TOKEN",
    ]);
    expect(() => validateEnv({})).toThrow(/ERP_SIM_DATABASE_URL/);
  });
});
