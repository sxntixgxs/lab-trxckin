import { describe, expect, test } from "vitest";

import { intersectSelectedWithAvailable } from "./reembolso-selection";

describe("intersectSelectedWithAvailable", () => {
  test("keeps only ids still available", () => {
    expect(
      intersectSelectedWithAvailable(["a", "b", "c"], ["b", "d"]),
    ).toEqual(["b"]);
  });

  test("returns empty when none remain", () => {
    expect(intersectSelectedWithAvailable(["a"], [])).toEqual([]);
  });
});
