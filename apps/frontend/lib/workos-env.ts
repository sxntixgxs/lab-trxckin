const EXPECTED = [
  { name: "WORKOS_CLIENT_ID", holds: "the client ID", prefix: "client_" },
  { name: "WORKOS_API_KEY", holds: "the API key", prefix: "sk_" },
] as const;

/**
 * WorkOS values that WorkOS rejects in any environment: missing, or pasted with the variable
 * name (`WORKOS_API_KEY=sk_…`), quotes or spaces. Otherwise the mistake only shows at the first
 * sign-in, as "Sign-in didn't finish". Messages name the variable, never its value. A well-formed
 * key from another WorkOS environment passes; it fails sign-in with `invalid_client`.
 */
export function workosEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  return EXPECTED.flatMap(({ name, holds, prefix }) => {
    const value = env[name];
    if (!value?.trim()) return [`${name} is not set.`];
    if (!value.startsWith(prefix) || /[\s"']/.test(value)) {
      return [`${name} must hold only ${holds} (it starts with ${prefix}), without the variable name, quotes or spaces.`];
    }
    return [];
  });
}
