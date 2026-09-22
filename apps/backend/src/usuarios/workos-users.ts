import { BadRequestException, InternalServerErrorException, Logger } from "@nestjs/common";

const logger = new Logger("WorkosUsers");

export type WorkosManagedUser = {
  id: string;
  email: string;
  /** True when this call created the WorkOS user (so a rollback may delete it). */
  created: boolean;
};

type WorkosUserPayload = {
  id?: string;
  email?: string;
};

function workosHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function requireApiKey(): string {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new InternalServerErrorException("WORKOS_API_KEY is not configured");
  }
  return apiKey;
}

function asManagedUser(
  payload: WorkosUserPayload,
  fallbackEmail: string,
  created: boolean,
): WorkosManagedUser | null {
  if (!payload.id) {
    return null;
  }
  return {
    id: payload.id,
    email: payload.email ?? fallbackEmail,
    created,
  };
}

export async function searchWorkosUserByEmail(email: string): Promise<WorkosManagedUser | null> {
  const apiKey = requireApiKey();
  const url = new URL("https://api.workos.com/user_management/users");
  url.searchParams.set("email", email);

  const response = await fetch(url, { headers: workosHeaders(apiKey) });
  if (!response.ok) {
    logger.error(`WorkOS user search failed (${response.status})`);
    throw new BadRequestException("No se pudo consultar WorkOS");
  }

  const payload = (await response.json()) as { data?: WorkosUserPayload[] };
  // Exact (case-insensitive) match only: never fall back to an arbitrary row.
  const wanted = email.trim().toLowerCase();
  const match = payload.data?.find((row) => row.email?.trim().toLowerCase() === wanted);
  return match ? asManagedUser(match, email, false) : null;
}

export async function findOrCreateWorkosUser(email: string, nombre: string): Promise<WorkosManagedUser> {
  const existing = await searchWorkosUserByEmail(email);
  if (existing) {
    return existing;
  }

  const apiKey = requireApiKey();
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? nombre.trim();
  const lastName = parts.slice(1).join(" ");

  const response = await fetch("https://api.workos.com/user_management/users", {
    method: "POST",
    headers: workosHeaders(apiKey),
    body: JSON.stringify({
      email,
      first_name: firstName,
      ...(lastName ? { last_name: lastName } : {}),
    }),
  });

  if (response.ok) {
    const created = asManagedUser((await response.json()) as WorkosUserPayload, email, true);
    if (created) {
      return created;
    }
  }

  const raced = await searchWorkosUserByEmail(email);
  if (raced) {
    return raced;
  }

  logger.error(`WorkOS create user failed (${response.status})`);
  throw new BadRequestException("No se pudo crear el usuario en WorkOS");
}

/** Best-effort compensation when the local insert fails after creating in WorkOS. */
export async function deleteWorkosUser(workosUserId: string): Promise<void> {
  const apiKey = requireApiKey();
  const response = await fetch(
    `https://api.workos.com/user_management/users/${encodeURIComponent(workosUserId)}`,
    { method: "DELETE", headers: workosHeaders(apiKey) },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`WorkOS delete user failed (${response.status})`);
  }
}
