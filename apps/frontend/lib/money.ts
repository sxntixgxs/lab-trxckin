const MONEY_DECIMAL_PLACES = 2;

function formatInteger(value: string) {
  const normalized = value.replace(/^0+(?=\d)/, "") || "0";
  return Number(normalized).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  });
}

function stripToMoneyChars(value: string) {
  return value.replace(/[^\d.,]/g, "");
}

/**
 * Diff `before` → `after` via shared prefix/suffix so we can tell whether the
 * user introduced a separator, pasted localized text, or only changed digits
 * while the formatter's thousands separators stayed put.
 */
function findEdit(before: string, after: string) {
  let prefixLen = 0;
  const minLen = Math.min(before.length, after.length);
  while (prefixLen < minLen && before[prefixLen] === after[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < before.length - prefixLen &&
    suffixLen < after.length - prefixLen &&
    before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  return {
    prefixLen,
    removed: before.slice(prefixLen, before.length - suffixLen),
    inserted: after.slice(prefixLen, after.length - suffixLen),
  };
}

function buildCanonical(integerPart: string, fractionPart: string, withDecimal: boolean) {
  if (!integerPart && !fractionPart && !withDecimal) return null;
  const normalizedInteger = integerPart || "0";
  if (!withDecimal) return normalizedInteger;
  return `${normalizedInteger}.${fractionPart}`;
}

/**
 * Parse a pasted or standalone money string. Auto-inserted thousands separators
 * are presentation-only; when both separators appear, the last one is decimal.
 * A lone `.` with exactly three fractional digits is treated as thousands
 * (`1.234` → `1234`). A lone `,` is always the decimal separator.
 */
function parseLocalizedMoney(cleaned: string) {
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    const decimalIndex = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
    const integerPart = cleaned.slice(0, decimalIndex).replace(/\D/g, "");
    const fractionPart = cleaned
      .slice(decimalIndex + 1)
      .replace(/\D/g, "")
      .slice(0, MONEY_DECIMAL_PLACES);
    return buildCanonical(integerPart, fractionPart, true);
  }

  if (hasComma) {
    const parts = cleaned.split(",");
    if (parts.length > 2) {
      const digits = cleaned.replace(/\D/g, "");
      return digits || null;
    }
    const integerPart = (parts[0] ?? "").replace(/\D/g, "");
    const fractionPart = (parts[1] ?? "").replace(/\D/g, "").slice(0, MONEY_DECIMAL_PLACES);
    return buildCanonical(integerPart, fractionPart, true);
  }

  if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      const digits = cleaned.replace(/\D/g, "");
      return digits || null;
    }
    const integerPart = (parts[0] ?? "").replace(/\D/g, "");
    const after = (parts[1] ?? "").replace(/\D/g, "");
    const trailing = cleaned.endsWith(".");
    if (trailing) {
      return buildCanonical(integerPart, "", true);
    }
    // Ambiguous single-dot group of three → thousands, not decimals.
    if (after.length === 3) {
      const digits = `${integerPart}${after}`;
      return digits || null;
    }
    return buildCanonical(integerPart, after.slice(0, MONEY_DECIMAL_PLACES), true);
  }

  const digits = cleaned.replace(/\D/g, "");
  return digits;
}

/**
 * Normalizes typed or pasted money while preserving a partially entered
 * decimal separator (for example, `1234,`). The returned value always uses
 * `.` as its internal decimal separator.
 *
 * Thousands separators produced by `formatMoneyInput` are presentation only:
 * they must not change the canonical value, public APIs, payloads, Convex, or
 * stored data. Only a `.` or `,` the user introduces (or a localized paste)
 * activates up to two decimal places.
 */
export function normalizeMoneyInput(raw: string, previousValue?: string) {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes("-")) return null;

  const cleaned = stripToMoneyChars(value);
  if (!cleaned) return "";

  if (previousValue === undefined) {
    return parseLocalizedMoney(cleaned);
  }

  const previousCleaned = stripToMoneyChars(formatMoneyInput(previousValue));
  const { prefixLen, inserted } = findEdit(previousCleaned, cleaned);
  const insertedSeparators = [...inserted].filter((char) => char === "." || char === ",");

  // Multi-character insert that includes separators → localized paste/replace.
  if (inserted.length > 1 && insertedSeparators.length > 0) {
    return parseLocalizedMoney(cleaned);
  }

  // A single `.` or `,` introduced by this edit is an explicit decimal.
  if (insertedSeparators.length === 1) {
    const separator = insertedSeparators[0]!;
    const separatorIndex = prefixLen + inserted.indexOf(separator);
    const integerPart = cleaned.slice(0, separatorIndex).replace(/\D/g, "");
    const fractionPart = cleaned
      .slice(separatorIndex + 1)
      .replace(/\D/g, "")
      .slice(0, MONEY_DECIMAL_PLACES);
    return buildCanonical(integerPart, fractionPart, true);
  }

  const previousInDecimalMode = previousValue.includes(".");
  // Display uses `,` as the decimal mark; if it remains, stay in decimal mode.
  // Removing it rejoins the digits as an integer.
  if (previousInDecimalMode && cleaned.includes(",")) {
    const decimalIndex = cleaned.lastIndexOf(",");
    const integerPart = cleaned.slice(0, decimalIndex).replace(/\D/g, "");
    const fractionPart = cleaned
      .slice(decimalIndex + 1)
      .replace(/\D/g, "")
      .slice(0, MONEY_DECIMAL_PLACES);
    return buildCanonical(integerPart, fractionPart, true);
  }

  // No new separator: ignore formatter thousands dots and keep an integer.
  const digits = cleaned.replace(/\D/g, "");
  return digits || null;
}

export function parseMoneyInput(value: string) {
  if (!value || value.endsWith(".")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePositiveMoneyInput(value: string) {
  const parsed = parseMoneyInput(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

export function formatMoneyInput(value: string) {
  if (!value) return "";
  const [integerPart, fractionPart] = value.split(".");
  const formattedInteger = formatInteger(integerPart || "0");
  if (value.endsWith(".")) return `$ ${formattedInteger},`;
  if (fractionPart !== undefined) return `$ ${formattedInteger},${fractionPart}`;
  return `$ ${formattedInteger}`;
}

/** Colombian display format without currency symbol (e.g. `1.234,5`). */
export function formatMoneyInputPlain(value: string) {
  if (!value) return "";
  const [integerPart, fractionPart] = value.split(".");
  const formattedInteger = formatInteger(integerPart || "0");
  if (value.endsWith(".")) return `${formattedInteger},`;
  if (fractionPart !== undefined) return `${formattedInteger},${fractionPart}`;
  return formattedInteger;
}

export function toMoneyCents(value: number) {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromMoneyCents(cents: number) {
  return cents / 100;
}

export function addMoneyAmounts(...values: Array<number | null>) {
  const cents = values.reduce<number>((total, value) => {
    if (value === null || !Number.isFinite(value)) return total;
    return total + toMoneyCents(value);
  }, 0);
  return fromMoneyCents(cents);
}

export function subtractMoneyAmounts(minuend: number, subtrahend: number) {
  return fromMoneyCents(toMoneyCents(minuend) - toMoneyCents(subtrahend));
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
