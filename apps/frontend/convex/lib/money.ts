export function toMoneyCents(value: number) {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromMoneyCents(cents: number) {
  return cents / 100;
}

export function subtractMoneyCents(a: number, b: number) {
  return toMoneyCents(a) - toMoneyCents(b);
}

export function addMoneyAmounts(...values: number[]) {
  const cents = values.reduce((total, value) => total + toMoneyCents(value), 0);
  return fromMoneyCents(cents);
}

export function subtractMoneyAmounts(minuend: number, subtrahend: number) {
  return fromMoneyCents(subtractMoneyCents(minuend, subtrahend));
}

export function hasAtMostTwoDecimals(value: number) {
  if (!Number.isFinite(value)) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

export function isMontoPositivo(value: number) {
  return Number.isFinite(value) && value > 0 && hasAtMostTwoDecimals(value);
}

export function moneyEquals(a: number, b: number) {
  return toMoneyCents(a) === toMoneyCents(b);
}

export function moneyGreaterThan(a: number, b: number) {
  return toMoneyCents(a) > toMoneyCents(b);
}

export function moneyGreaterThanOrEqual(a: number, b: number) {
  return toMoneyCents(a) >= toMoneyCents(b);
}

export function moneyLessThan(a: number, b: number) {
  return toMoneyCents(a) < toMoneyCents(b);
}

export function moneyLessThanOrEqual(a: number, b: number) {
  return toMoneyCents(a) <= toMoneyCents(b);
}
