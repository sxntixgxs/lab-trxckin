import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertEmpresaMcp, empresasMcp } from "./mcp-scope";

describe("empresasMcp", () => {
  it("parses a comma-separated list of app companies", () => {
    expect(empresasMcp("1, 2")).toEqual([1, 2]);
  });

  it("fails closed: unset, empty or unknown ids give no company", () => {
    expect(empresasMcp(undefined)).toEqual([]);
    expect(empresasMcp("")).toEqual([]);
    expect(empresasMcp("9,abc")).toEqual([]);
  });

  it("drops duplicates", () => {
    expect(empresasMcp("1,1")).toEqual([1]);
  });
});

describe("assertEmpresaMcp", () => {
  it("rejects a company outside the scope", () => {
    expect(() => assertEmpresaMcp(2, [1])).toThrow(ForbiddenException);
    expect(() => assertEmpresaMcp(1, [1])).not.toThrow();
  });
});
