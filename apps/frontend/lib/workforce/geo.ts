import type { GpsFix, Site } from './types';

const EARTH_RADIUS_METERS = 6_371_000;
const radians = (n: number) => (n * Math.PI) / 180;

function validCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  );
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!validCoordinate(lat1, lng1) || !validCoordinate(lat2, lng2)) throw new Error('Coordenadas inválidas.');
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** The caller must supply only sites eligible for this employee and shift.
 * Freshness uses server time. Client time is evidence, never attendance time. */
export function validateGps(
  fix: GpsFix,
  sites: Site[],
  now: number,
): { siteId: string; siteName: string; distance: number } {
  if (!validCoordinate(fix.latitude, fix.longitude))
    throw new Error('La ubicación contiene coordenadas inválidas. Solicita una nueva ubicación.');
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0) throw new Error('La precisión de la ubicación es inválida.');
  if (!Number.isFinite(fix.timestamp) || !Number.isFinite(now) || fix.timestamp > now)
    throw new Error('La fecha de la ubicación es inválida. Solicita una nueva ubicación.');
  const activeSites = sites.filter((site) => site.active);
  if (!activeSites.length) throw new Error('No tienes una sede habilitada para esta marcación. Contacta al gestor.');
  const candidates = activeSites.filter(
    (site) =>
      validCoordinate(site.latitude, site.longitude) &&
      [site.radius, site.tolerance, site.maxAccuracy, site.maxAgeSeconds].every((n) => Number.isFinite(n) && n >= 0),
  );
  const fresh = candidates.filter((site) => now - fix.timestamp <= site.maxAgeSeconds * 1_000);
  if (!fresh.length) throw new Error('La ubicación está vencida. Solicita una nueva ubicación.');
  const precise = fresh.filter((site) => fix.accuracy <= site.maxAccuracy);
  if (!precise.length)
    throw new Error('La ubicación es demasiado imprecisa. Activa la ubicación precisa e inténtalo de nuevo.');
  const eligible = precise
    .map((site) => ({ site, distance: distanceMeters(fix.latitude, fix.longitude, site.latitude, site.longitude) }))
    .filter(({ site, distance }) => distance <= site.radius + site.tolerance + 1e-7)
    .sort((a, b) => a.distance - b.distance || a.site.id.localeCompare(b.site.id));
  const match = eligible[0];
  if (!match)
    throw new Error('Estás fuera del radio de las sedes habilitadas. Acércate o solicita una corrección al gestor.');
  return { siteId: match.site.id, siteName: match.site.name, distance: match.distance };
}
