import { describe, expect, it } from 'vitest';
import { distanceMeters, validateGps } from './geo';
import type { GpsFix, Site } from './types';

const now = Date.parse('2026-09-21T14:00:00Z');
const fix: GpsFix = { latitude: 0, longitude: 0, accuracy: 20, timestamp: now };
const site: Site = {
  id: 'site',
  companyId: 1,
  name: 'Sede',
  latitude: 0,
  longitude: 0,
  radius: 150,
  tolerance: 30,
  maxAccuracy: 100,
  maxAgeSeconds: 60,
  active: true,
  revision: 1,
};
const metersLatitude = (meters: number) => ((meters / 6_371_000) * 180) / Math.PI;

describe('GPS evidence validation', () => {
  it('computes stable Haversine distances', () => {
    expect(distanceMeters(0, 0, 0, 0)).toBe(0);
    expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(111_194.927, 2);
    expect(distanceMeters(0, 0, 0, 180)).toBeCloseTo(Math.PI * 6_371_000, 2);
  });

  it('includes the exact configured radius plus tolerance', () => {
    expect(validateGps({ ...fix, latitude: metersLatitude(180) }, [site], now).distance).toBeCloseTo(180, 7);
    expect(() => validateGps({ ...fix, latitude: metersLatitude(180.01) }, [site], now)).toThrow('fuera del radio');
  });

  it('checks all eligible sites instead of failing at the closest center', () => {
    const close = { ...site, id: 'close', latitude: metersLatitude(50), radius: 10, tolerance: 0 };
    const farther = { ...site, id: 'farther', latitude: metersLatitude(100) };
    expect(validateGps(fix, [close, farther], now).siteId).toBe('farther');
  });

  it('chooses the nearest among valid eligible sites', () => {
    expect(
      validateGps(
        fix,
        [
          { ...site, id: 'far', latitude: metersLatitude(100) },
          { ...site, id: 'near', latitude: metersLatitude(20) },
        ],
        now,
      ).siteId,
    ).toBe('near');
  });

  it('accepts inclusive accuracy/freshness thresholds and rejects stale and future fixes', () => {
    expect(validateGps({ ...fix, accuracy: 100, timestamp: now - 60_000 }, [site], now).siteId).toBe('site');
    expect(() => validateGps({ ...fix, timestamp: now - 60_001 }, [site], now)).toThrow('vencida');
    expect(() => validateGps({ ...fix, timestamp: now + 1 }, [site], now)).toThrow('fecha');
    expect(() => validateGps({ ...fix, accuracy: 100.1 }, [site], now)).toThrow('imprecisa');
  });

  it.each([
    { latitude: Number.NaN },
    { longitude: Number.POSITIVE_INFINITY },
    { latitude: 91 },
    { longitude: -181 },
    { accuracy: -1 },
    { accuracy: Number.NaN },
    { timestamp: Number.NaN },
  ])('rejects malformed client evidence %j', (patch) => {
    expect(() => validateGps({ ...fix, ...patch }, [site], now)).toThrow();
  });

  it('never accepts inactive sites or supplies a fallback site', () => {
    expect(() => validateGps(fix, [{ ...site, active: false }], now)).toThrow('sede habilitada');
    expect(() => validateGps(fix, [], now)).toThrow('sede habilitada');
  });

  it('applies freshness and accuracy per eligible site', () => {
    const strict = { ...site, id: 'strict', maxAgeSeconds: 10, maxAccuracy: 10 };
    const permissive = { ...site, id: 'permissive', latitude: metersLatitude(100) };
    expect(validateGps({ ...fix, timestamp: now - 20_000 }, [strict, permissive], now).siteId).toBe('permissive');
  });
});
