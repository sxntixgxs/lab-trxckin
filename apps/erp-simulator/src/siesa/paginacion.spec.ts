import { describe, expect, it } from "vitest";
import { ErrorConsulta } from "./errores";
import { parsearPaginacion, TAMANO_PAGINA_MAXIMO, TAMANO_PAGINA_POR_DEFECTO } from "./paginacion";

describe("parsearPaginacion", () => {
  it("reads numPag and tamPag", () => {
    expect(parsearPaginacion("numPag=3|tamPag=50")).toEqual({ pagina: 3, tamano: 50 });
    expect(parsearPaginacion(" tampag = 20 | NUMPAG = 2 ")).toEqual({ pagina: 2, tamano: 20 });
  });

  it("falls back to the defaults", () => {
    expect(parsearPaginacion(undefined)).toEqual({ pagina: 1, tamano: TAMANO_PAGINA_POR_DEFECTO });
    expect(parsearPaginacion("numPag=4")).toEqual({ pagina: 4, tamano: TAMANO_PAGINA_POR_DEFECTO });
  });

  it("rejects invalid values", () => {
    for (const valor of ["numPag=0", "numPag=-1", "numPag=a", "tamPag=", "otro=1", "numPag=1=2", `tamPag=${TAMANO_PAGINA_MAXIMO + 1}`]) {
      expect(() => parsearPaginacion(valor)).toThrow(ErrorConsulta);
    }
  });
});
