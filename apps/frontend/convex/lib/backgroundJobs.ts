/**
 * Trabajos en segundo plano (crons, sincronizaciones externas) solo deben
 * ejecutarse en producción. En dev/preview el cron sigue registrado, pero el
 * handler sale de inmediato y no consume recursos.
 *
 * Configurar solo en prod:
 *   npx convex env set ENABLE_BACKGROUND_JOBS true --prod
 */
export function backgroundJobsHabilitados(): boolean {
  return process.env.ENABLE_BACKGROUND_JOBS === "true";
}
