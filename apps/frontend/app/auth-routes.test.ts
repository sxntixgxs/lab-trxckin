import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SIGN_IN_URL = "https://auth.example.com/sign-in";
const SIGN_UP_URL = "https://auth.example.com/sign-up";

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: vi.fn(async () => SIGN_IN_URL),
  getSignUpUrl: vi.fn(async () => SIGN_UP_URL),
}));

import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { GET as signIn } from "@/app/sign-in/route";
import { GET as signUp } from "@/app/sign-up/route";

/** `redirect()` throws NEXT_REDIRECT; resolve to the digest that names its target. */
async function redirectDigest(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest;
    throw error;
  }
  throw new Error("expected a redirect");
}

const signInWith = (query: string) => signIn(new NextRequest(`http://localhost/sign-in${query}`));

describe("auth routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sign-in without a return path uses AuthKit's default", async () => {
    expect(await redirectDigest(() => signInWith(""))).toContain(SIGN_IN_URL);
    expect(getSignInUrl).toHaveBeenCalledWith({});
  });

  it("sign-in carries a valid return path with a constant state", async () => {
    expect(await redirectDigest(() => signInWith("?returnTo=%2Fbilling%3Festado%3Dpendiente"))).toContain(SIGN_IN_URL);
    expect(getSignInUrl).toHaveBeenCalledWith({ returnTo: "/billing?estado=pendiente", state: "lab" });
  });

  it.each(["%2F%2Fevil.com", "https%3A%2F%2Fevil.com", "%2F.%2F%2Fevil.com", "%2Ffacturaci%C3%B3n", "%2Fsign-in"])(
    "sign-in drops the return path %s",
    async (returnTo) => {
      await redirectDigest(() => signInWith(`?returnTo=${returnTo}`));
      expect(getSignInUrl).toHaveBeenCalledWith({});
    },
  );

  it("sign-up always returns to the dashboard", async () => {
    expect(await redirectDigest(() => signUp())).toContain(SIGN_UP_URL);
    expect(getSignUpUrl).toHaveBeenCalledWith({ returnTo: "/dashboard" });
  });
});
