import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { filtrarUsuarios, indexarUsuarios, inicialesDe } from "./acting-banner-lib";

describe("acting banner search", () => {
  it("builds initials and filters by name tokens", () => {
    assert.equal(inicialesDe("Santiago Sandoval"), "SS");
    const indexed = indexarUsuarios([
      { id: "1", nombre: "Santiago Sandoval", email: "santi@example.com" },
      { id: "2", nombre: "Ana Pérez", email: "ana@example.com" },
    ]);
    assert.deepEqual(filtrarUsuarios(indexed, "sant"), [
      { id: "1", nombre: "Santiago Sandoval", email: "santi@example.com" },
    ]);
  });
});
