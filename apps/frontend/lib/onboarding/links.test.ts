import { describe, expect, test } from "vitest";
import { buildInternalOnboardingUrl, buildPublicOnboardingUrl } from "./links";

describe("buildPublicOnboardingUrl", () => {
  test("form link", () => {
    expect(
      buildPublicOnboardingUrl("https://app.example.com/", {
        modulo: "supplier",
        scope: "FORM",
        inscripcionId: "abc123",
        token: "t0k-en_",
      }),
    ).toBe("https://app.example.com/onboarding/supplier?id=abc123&t=t0k-en_");
  });

  test("sign link", () => {
    expect(
      buildPublicOnboardingUrl("http://localhost:3000", {
        modulo: "customer",
        scope: "SIGN",
        inscripcionId: "x",
        token: "y",
      }),
    ).toBe("http://localhost:3000/onboarding/customer/sign?id=x&t=y");
  });

  test("internal links", () => {
    expect(buildInternalOnboardingUrl("http://localhost:3000/", "supplier")).toBe("http://localhost:3000/suppliers/onboarding");
    expect(buildInternalOnboardingUrl("http://localhost:3000", "customer")).toBe("http://localhost:3000/customers/onboarding");
  });
});
