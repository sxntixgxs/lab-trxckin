import { afterEach, describe, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders.current) }));

import { withAuth } from "@workos-inc/authkit-nextjs";
import { rootLayoutAccessToken } from "@/lib/root-layout-auth";

const notCovered = new Error("You are calling 'withAuth' on a route that isn't covered by the AuthKit middleware.");

describe("rootLayoutAccessToken", () => {
  afterEach(() => {
    vi.clearAllMocks();
    requestHeaders.current = new Headers();
  });

  it("returns the session's access token", async () => {
    vi.mocked(withAuth).mockResolvedValue({ user: null, accessToken: "token" } as Awaited<ReturnType<typeof withAuth>>);

    expect(await rootLayoutAccessToken()).toBe("token");
  });

  it("renders signed out when the proxy skipped the request, e.g. a missing /favicon.ico", async () => {
    vi.mocked(withAuth).mockRejectedValue(notCovered);

    expect(await rootLayoutAccessToken()).toBeUndefined();
  });

  it("rethrows when the proxy handled the request", async () => {
    requestHeaders.current = new Headers({ "x-workos-middleware": "true" });
    vi.mocked(withAuth).mockRejectedValue(new Error("session broke"));

    await expect(rootLayoutAccessToken()).rejects.toThrow("session broke");
  });
});
