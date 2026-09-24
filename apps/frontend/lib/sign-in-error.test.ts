import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signInErrorMessage, signInErrorResponse } from "./sign-in-error";

describe("signInErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a callback without a code back to the entry page", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new NextRequest(
      "https://app.example.com/callback?error=access_denied&error_description=User%20cancelled",
    );

    const response = signInErrorResponse({ request });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/?error=sign-in");
    expect(log).toHaveBeenCalledWith(
      "[auth] sign-in failed",
      expect.objectContaining({ error: "access_denied", description: "User cancelled" }),
    );
  });

  it("does the same when the code exchange throws", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new NextRequest("https://app.example.com/callback?code=bogus&state=abc");

    const response = signInErrorResponse({ error: new Error("invalid_grant"), request });

    expect(response.headers.get("location")).toBe("https://app.example.com/?error=sign-in");
    expect(log).toHaveBeenCalledWith("[auth] sign-in failed", expect.objectContaining({ cause: "invalid_grant" }));
  });

  it("returns a response whose headers AuthKit can still change", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = signInErrorResponse({ request: new NextRequest("https://app.example.com/callback") });
    expect(() => response.headers.set("Cache-Control", "no-store")).not.toThrow();
  });
});

describe("signInErrorMessage", () => {
  it("only answers the sign-in flag, with fixed text", () => {
    expect(signInErrorMessage("sign-in")).toMatch(/^Sign-in didn't finish/);
    for (const value of [undefined, "", "Sign-in", "<script>", ["sign-in"], "access_denied"]) {
      expect(signInErrorMessage(value)).toBeNull();
    }
  });
});
