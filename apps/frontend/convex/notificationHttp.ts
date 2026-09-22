import { env } from "./_generated/server";

export function notificationHeaders(): Record<string, string> {
  const key = env.NOTIFICATIONS_INTERNAL_KEY;
  if (!key) {
    throw new Error("NOTIFICATIONS_INTERNAL_KEY no está configurada en Convex");
  }

  return {
    "Content-Type": "application/json",
    "x-notifications-key": key,
  };
}
