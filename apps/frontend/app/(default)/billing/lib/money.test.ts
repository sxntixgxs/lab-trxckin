import { describe, expect, test } from "vitest";

import {
  addMoneyAmounts,
  formatMoneyInput,
  hasAtMostTwoDecimals,
  normalizeMoneyInput,
  parseMoneyInput,
} from "@/lib/money";

/** Simulates the controlled input cycle: format → edit → normalize. */
function typeAtEnd(previousCanonical: string, chunk: string) {
  const display = formatMoneyInput(previousCanonical);
  return normalizeMoneyInput(`${display}${chunk}`, previousCanonical);
}

function backspaceOnce(previousCanonical: string) {
  const display = formatMoneyInput(previousCanonical);
  return normalizeMoneyInput(display.slice(0, -1), previousCanonical);
}

function typeSequence(digits: string) {
  let value = "";
  for (const char of digits) {
    const next = typeAtEnd(value, char);
    expect(next).not.toBeNull();
    value = next!;
  }
  return value;
}

describe("money input", () => {
  test.each([
    ["1234,56", "1234.56"],
    ["1234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["$ 5.555.555,25", "5555555.25"],
    ["5.555.555", "5555555"],
    ["1234,", "1234."],
    ["1.234", "1234"],
  ])("normalizes pasted %s", (raw, expected) => {
    expect(normalizeMoneyInput(raw)).toBe(expected);
  });

  test("preserves an empty input and rejects negatives", () => {
    expect(normalizeMoneyInput("$ ")).toBe("");
    expect(normalizeMoneyInput("-123,45")).toBeNull();
    expect(normalizeMoneyInput("")).toBe("");
  });

  test("limits the fractional part to two digits", () => {
    expect(normalizeMoneyInput("1234,567")).toBe("1234.56");
    expect(normalizeMoneyInput("$ 1,234", "1.23")).toBe("1.23");
  });

  test("formats the canonical value in the Colombian display format", () => {
    expect(formatMoneyInput("5555555.25")).toBe("$ 5.555.555,25");
    expect(formatMoneyInput("1234.")).toBe("$ 1.234,");
    expect(formatMoneyInput("20000")).toBe("$ 20.000");
    expect(formatMoneyInput("20000.50")).toBe("$ 20.000,50");
  });

  test("keeps digit-only typing as integers through live thousands grouping", () => {
    expect(typeSequence("200")).toBe("200");
    expect(formatMoneyInput(typeSequence("200"))).toBe("$ 200");

    expect(typeSequence("2000")).toBe("2000");
    expect(formatMoneyInput(typeSequence("2000"))).toBe("$ 2.000");

    expect(typeSequence("20000")).toBe("20000");
    expect(formatMoneyInput(typeSequence("20000"))).toBe("$ 20.000");

    expect(typeSequence("1234567")).toBe("1234567");
    expect(formatMoneyInput(typeSequence("1234567"))).toBe("$ 1.234.567");

    const crossed = typeAtEnd("999", "0");
    expect(crossed).toBe("9990");
    expect(formatMoneyInput(crossed!)).toBe("$ 9.990");

    const toThousand = typeSequence("1000");
    expect(toThousand).toBe("1000");
    expect(formatMoneyInput(toThousand)).toBe("$ 1.000");
  });

  test("activates decimals only when the user types an explicit separator", () => {
    let value = typeSequence("1234");
    expect(formatMoneyInput(value)).toBe("$ 1.234");

    value = typeAtEnd(value, ",")!;
    expect(value).toBe("1234.");
    expect(formatMoneyInput(value)).toBe("$ 1.234,");

    value = typeAtEnd(value, "5")!;
    expect(value).toBe("1234.5");
    value = typeAtEnd(value, "6")!;
    expect(value).toBe("1234.56");
    expect(formatMoneyInput(value)).toBe("$ 1.234,56");

    // Dot as explicit decimal after thousands grouping.
    value = typeSequence("1234");
    value = typeAtEnd(value, ".")!;
    expect(value).toBe("1234.");
    value = typeAtEnd(value, "5")!;
    value = typeAtEnd(value, "6")!;
    expect(value).toBe("1234.56");
    expect(formatMoneyInput(value)).toBe("$ 1.234,56");
  });

  test("caps decimals, keeps an incomplete separator, and handles clear/replace", () => {
    let value = "1234.56";
    expect(typeAtEnd(value, "7")).toBe("1234.56");

    value = typeAtEnd("1234", ",")!;
    expect(value).toBe("1234.");
    expect(formatMoneyInput(value)).toBe("$ 1.234,");

    expect(normalizeMoneyInput("", "1234.56")).toBe("");
    expect(normalizeMoneyInput("$ ", "1234.56")).toBe("");

    // Selection replace with a single digit.
    expect(normalizeMoneyInput("5", "1234.56")).toBe("5");
    // Selection replace with a localized paste.
    expect(normalizeMoneyInput("1.234,56", "999")).toBe("1234.56");
  });

  test("backspacing over a thousands-grouped integer does not invent decimals", () => {
    expect(backspaceOnce("2000")).toBe("200");
    expect(formatMoneyInput(backspaceOnce("2000")!)).toBe("$ 200");

    expect(backspaceOnce("20000")).toBe("2000");
    expect(formatMoneyInput(backspaceOnce("20000")!)).toBe("$ 2.000");

    // Removing the displayed decimal comma rejoins digits as an integer.
    expect(normalizeMoneyInput("$ 1.23456", "1234.56")).toBe("123456");
  });

  test("parses Colombian, Anglo, and currency-symbol pastes", () => {
    expect(normalizeMoneyInput("$ 20.000")).toBe("20000");
    expect(normalizeMoneyInput("$ 20.000,50")).toBe("20000.50");
    expect(normalizeMoneyInput("20,000.50")).toBe("20000.50");
    expect(normalizeMoneyInput("1.234")).toBe("1234");
    expect(normalizeMoneyInput("$1,234.56")).toBe("1234.56");
  });

  test("adds amounts using cent units and rejects incomplete decimals", () => {
    expect(addMoneyAmounts(0.1, 0.2)).toBe(0.3);
    expect(addMoneyAmounts(5555555.25, 44.75)).toBe(5555600);
    expect(addMoneyAmounts(20000, 50.5)).toBe(20050.5);
    expect(parseMoneyInput("1234.56")).toBe(1234.56);
    expect(parseMoneyInput("1234.")).toBeNull();
  });

  test("validates the supported precision", () => {
    expect(hasAtMostTwoDecimals(10.25)).toBe(true);
    expect(hasAtMostTwoDecimals(10.255)).toBe(false);
  });
});
