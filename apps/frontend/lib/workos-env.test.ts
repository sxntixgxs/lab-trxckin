import { describe, expect, it } from "vitest";
import { workosEnvProblems } from "@/lib/workos-env";

const valid = { WORKOS_CLIENT_ID: "client_01ABCDEFGHJKMNPQRSTVWXYZ00", WORKOS_API_KEY: "sk_test_secret" };

describe("workosEnvProblems", () => {
  it("accepts a client ID and an API key", () => {
    expect(workosEnvProblems(valid)).toEqual([]);
    expect(workosEnvProblems({ ...valid, WORKOS_API_KEY: "sk_live_secret" })).toEqual([]);
  });

  it("reports missing or blank values", () => {
    expect(workosEnvProblems({ WORKOS_API_KEY: " " })).toEqual([
      "WORKOS_CLIENT_ID is not set.",
      "WORKOS_API_KEY is not set.",
    ]);
  });

  it.each([
    ["the variable name pasted into the value", "WORKOS_API_KEY=sk_test_secret"],
    ["quotes", '"sk_test_secret"'],
    ["a trailing space", "sk_test_secret "],
    ["something that isn't a key", "client_01ABCDEFGHJKMNPQRSTVWXYZ00"],
  ])("reports an API key with %s, without echoing it", (_, value) => {
    const problems = workosEnvProblems({ ...valid, WORKOS_API_KEY: value });

    expect(problems).toEqual([expect.stringMatching(/^WORKOS_API_KEY must hold only the API key/)]);
    expect(problems.join(" ")).not.toContain("secret");
  });

  it("reports a client ID pasted with its name", () => {
    expect(workosEnvProblems({ ...valid, WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID=client_01ABC" })).toEqual([
      expect.stringMatching(/^WORKOS_CLIENT_ID must hold only the client ID/),
    ]);
  });
});
