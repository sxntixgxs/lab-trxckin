import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { TercerosCatalogoService, type ExistenciaTercero } from "../terceros/terceros-catalogo.service";
import { companiaErpDeEmpresa, type EntidadErp } from "./erp.config";
import type { CrearTerceroErpDto } from "./dto/erp.dto";
import { construirDocumentoTercero } from "./siesa/conector-tercero";
import { ErpError } from "./siesa/siesa-client";
import { ErpSyncService } from "./sync/erp-sync.service";

export type ResultadoCreacionErp = {
  erpTerceroId: string;
  sucursalId: string;
  accion: "CREADO" | "ACTUALIZADO";
  /** False when the tercero was registered but the follow-up catalog sync could not pick it up. */
  catalogoActualizado: boolean;
  existencia: ExistenciaTercero;
};

type DetalleImportacion = { f200_id: string; f200_nit: string; sucursal: string; accion: "CREADO" | "ACTUALIZADO" };

function leerDetalleImportacion(respuesta: unknown): DetalleImportacion | null {
  const detalle = (respuesta as { detalle?: unknown } | null)?.detalle;
  const primero = Array.isArray(detalle) ? (detalle[0] as Record<string, unknown> | undefined) : undefined;
  if (!primero || typeof primero !== "object") return null;
  const f200Id = String(primero.f200_id ?? "").trim();
  const f200Nit = String(primero.f200_nit ?? "").trim();
  if (!f200Id || !f200Nit) return null;
  return {
    f200_id: f200Id,
    f200_nit: f200Nit,
    sucursal: String(primero.sucursal ?? "001"),
    accion: primero.accion === "ACTUALIZADO" ? "ACTUALIZADO" : "CREADO",
  };
}

/** Readable form of SIESA's import errors (`[{ nivel, campo, mensaje }]` or a string). */
function describirDetalle(detalle: unknown): string {
  if (typeof detalle === "string") return detalle;
  if (!Array.isArray(detalle)) return "";
  return detalle
    .map((item) => {
      const registro = (item ?? {}) as Record<string, unknown>;
      const campo = typeof registro.campo === "string" && registro.campo ? `${registro.campo}: ` : "";
      return typeof registro.mensaje === "string" ? `${campo}${registro.mensaje}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

function comoHttp(error: unknown): unknown {
  if (!(error instanceof ErpError)) return error;
  if (error.status !== null && error.status >= 400 && error.status < 500) {
    const detalle = describirDetalle(error.detalle);
    return new UnprocessableEntityException(
      `El ERP rechazó el tercero: ${error.message}${detalle ? ` (${detalle})` : ""}`,
    );
  }
  return new BadGatewayException(`No se pudo registrar el tercero en el ERP: ${error.message}`);
}

/** "Crear en ERP": registers an onboarded tercero and pulls it into the catalog right away. */
@Injectable()
export class ErpTercerosService {
  constructor(
    private readonly sync: ErpSyncService,
    private readonly catalogo: TercerosCatalogoService,
  ) {}

  async crearEnErp(datos: CrearTerceroErpDto, idUsuario: string): Promise<ResultadoCreacionErp> {
    const compania = companiaErpDeEmpresa(datos.empresa);
    if (!compania) throw new BadRequestException("La empresa no tiene compañía en el ERP.");
    const erp = this.sync.clienteErp();
    const { nit, documento } = construirDocumentoTercero(datos, compania.cia);

    let respuesta: unknown;
    try {
      respuesta = await erp.importar(
        {
          idCompania: compania.idCompania,
          nombreDocumento: datos.entidad === "PROVEEDOR" ? "tercero-proveedor" : "tercero-cliente",
        },
        documento,
      );
    } catch (error) {
      throw comoHttp(error);
    }
    const detalle = leerDetalleImportacion(respuesta);
    if (!detalle) throw new BadGatewayException("Respuesta inesperada del ERP al registrar el tercero.");

    const entidad: EntidadErp = datos.entidad === "PROVEEDOR" ? "PROVEEDORES" : "CLIENTES";
    const resumen = await this.sync
      .sincronizarNit({ entidad, empresa: datos.empresa, nitErp: detalle.f200_nit, origen: "CREACION_ERP", idUsuario })
      .catch((error: unknown) => {
        // The tercero is already in the ERP; a failed follow-up sync must not hide that.
        if (error instanceof HttpException) throw error;
        return null;
      });
    const existencia = await this.catalogo.existencia(entidad, datos.empresa, nit, datos.tipoDocumento);

    return {
      erpTerceroId: detalle.f200_id,
      sucursalId: detalle.sucursal,
      accion: detalle.accion,
      catalogoActualizado: resumen?.estado === "EXITOSA" && existencia.existe,
      existencia,
    };
  }
}
