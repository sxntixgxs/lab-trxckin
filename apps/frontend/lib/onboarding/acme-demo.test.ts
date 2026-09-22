import { describe, expect, test } from "vitest";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { ACME_DEMO, ACME_DEMO_CLIENTE, ACME_DEMO_PROVEEDOR, fillEmptyFields } from "./acme-demo";
import { computeCustomerRisk } from "./risk/customer-matrix";
import { computeSupplierRisk } from "./risk/supplier-matrix";

describe("ACME demo data", () => {
  const factores = { jurisdiccionNacional: ACME_DEMO.jurisdiccionNacional, jurisdiccionInternacional: "", isPep: false, listas: "NO" };

  test("starts both processes on the lightest risk path", () => {
    expect(computeSupplierRisk({ ...factores, ...ACME_DEMO_PROVEEDOR })).toEqual({ riesgo: "BAJO", tipoEvaluacion: "SOLO LISTAS" });
    expect(computeCustomerRisk({ ...factores, ...ACME_DEMO_CLIENTE })).toEqual({ riesgo: "BAJO", tipoEvaluacion: "SOLO LISTAS" });
  });

  test("uses CIIU codes from the catalog", () => {
    expect(CIIU_ACTIVIDAD[ACME_DEMO.codigoCiiu]).toBeTruthy();
    expect(CIIU_ACTIVIDAD[ACME_DEMO.codigoCiiuSecundario]).toBeTruthy();
  });
});

describe("fillEmptyFields", () => {
  const demo = { nombre: "ACME", ciiu: "2599", actividad: "Metal", nacional: "Santander", internacional: "", pep: false };
  const groups = [
    ["ciiu", "actividad"],
    ["nacional", "internacional"],
  ] as const;

  test("fills every empty field of a blank form", () => {
    expect(fillEmptyFields({ nombre: "", ciiu: "", actividad: "", nacional: "", internacional: "", pep: false }, demo, groups)).toEqual(demo);
  });

  test("keeps typed values, treating whitespace as empty", () => {
    expect(fillEmptyFields({ nombre: "Real S.A.S.", ciiu: " ", actividad: "", nacional: "", internacional: "", pep: true }, demo, groups)).toEqual({
      ...demo,
      nombre: "Real S.A.S.",
      pep: true,
    });
  });

  test("fills a group only when all of its fields are empty", () => {
    expect(fillEmptyFields({ nombre: "", ciiu: "4711", actividad: "", nacional: "", internacional: "Chile", pep: false }, demo, groups)).toEqual({
      ...demo,
      ciiu: "4711",
      actividad: "",
      nacional: "",
      internacional: "Chile",
    });
  });
});
