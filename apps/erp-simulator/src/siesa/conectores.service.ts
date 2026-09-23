import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { normalizarNit } from "../datos/nit";
import { PrismaService } from "../prisma/prisma.service";
import { validarImportacion, type ErrorImportacion, type ImportacionTercero } from "./conector";
import { SiesaHttpException } from "./errores";

export type ParametrosImportacion = { idCompania?: string; idDocumento?: string; nombreDocumento?: string };

export type DetalleImportacion = {
  f200_rowid: number;
  f200_id: string;
  f200_nit: string;
  tipo: "PROVEEDOR" | "CLIENTE";
  sucursal: string;
  /** CREADO when the tercero did not exist in that company, ACTUALIZADO otherwise. */
  accion: "CREADO" | "ACTUALIZADO";
};

@Injectable()
export class ConectoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `conectoresimportar` for the "tercero + proveedor/cliente" document. Idempotent: the tercero
   * is matched by company and document number (ignoring zero padding) and its branches are
   * upserted, so sending the same document twice updates instead of duplicating.
   */
  async importar(params: ParametrosImportacion, cuerpo: unknown) {
    const idInstancia = params.idCompania?.trim() ?? "";
    const registrar = (exitosa: boolean, resultado: unknown) =>
      this.prisma.importacion.create({
        data: {
          id_instancia: idInstancia,
          id_documento: params.idDocumento?.trim() || null,
          nombre_documento: params.nombreDocumento?.trim() || null,
          payload: (cuerpo ?? {}) as Prisma.InputJsonValue,
          exitosa,
          resultado: resultado as Prisma.InputJsonValue,
        },
      });
    const rechazar = async (errores: ErrorImportacion[]) => {
      await registrar(false, errores);
      return new SiesaHttpException(HttpStatus.BAD_REQUEST, "Errores en la importación", errores);
    };

    const validacion = validarImportacion(cuerpo);
    if (!validacion.ok) throw await rechazar(validacion.errores);
    const { datos } = validacion;

    const compania = await this.prisma.compania.findUnique({
      where: { id_instancia_f010_id: { id_instancia: idInstancia, f010_id: datos.cia } },
    });
    if (!compania) {
      throw await rechazar([
        { nivel: "Inicial", campo: "F_CIA", mensaje: `La compañía ${datos.cia} no existe en idCompania ${idInstancia}.` },
      ]);
    }

    let detalle: DetalleImportacion[];
    try {
      detalle = await this.prisma.$transaction((tx) => this.aplicar(tx, idInstancia, datos));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw await rechazar([
          { nivel: "Tercero", campo: "F200_ID", mensaje: "Ya existe otro tercero con ese código en la compañía." },
        ]);
      }
      throw error;
    }
    await registrar(true, detalle);
    return { codigo: 0, mensaje: "Importación exitosa", detalle };
  }

  private async aplicar(
    tx: Prisma.TransactionClient,
    idInstancia: string,
    datos: ImportacionTercero,
  ): Promise<DetalleImportacion[]> {
    const t = datos.tercero;
    const documento = normalizarNit(t.nit);
    const candidatos = await tx.tercero.findMany({
      where: { id_instancia: idInstancia, f200_id_cia: datos.cia, f200_nit: { endsWith: documento } },
    });
    const existente = candidatos.find((c) => normalizarNit(c.f200_nit) === documento) ?? null;

    const comunes = {
      f200_dv_nit: t.dv,
      f200_id_tipo_ident: t.tipoIdentificacion,
      f200_ind_tipo_tercero: t.tipoTercero,
      f200_razon_social: t.razonSocial,
      f200_nombres: t.nombres,
      f200_apellido1: t.apellido1,
      f200_apellido2: t.apellido2,
      f200_ind_estado: t.activo ? 1 : 0,
      f200_id_ciiu: t.ciiu,
    };
    const tercero = existente
      ? await tx.tercero.update({
          where: { f200_rowid: existente.f200_rowid },
          data: {
            ...comunes,
            // Registering it as supplier never removes it as customer, and vice versa.
            f200_ind_cliente: existente.f200_ind_cliente === 1 || t.esCliente ? 1 : 0,
            f200_ind_proveedor: existente.f200_ind_proveedor === 1 || t.esProveedor ? 1 : 0,
          },
        })
      : await tx.tercero.create({
          data: {
            ...comunes,
            id_instancia: idInstancia,
            f200_id_cia: datos.cia,
            f200_id: t.id,
            f200_nit: t.nit,
            f200_ind_cliente: t.esCliente ? 1 : 0,
            f200_ind_proveedor: t.esProveedor ? 1 : 0,
          },
        });
    const accion = existente ? "ACTUALIZADO" : "CREADO";
    const contacto = {
      f015_email: t.contacto.email,
      f015_telefono: t.contacto.telefono,
      f015_direccion1: t.contacto.direccion,
      f015_ciudad: t.contacto.ciudad,
      f015_departamento: t.contacto.departamento,
    };

    const detalle: DetalleImportacion[] = [];
    const base = { f200_rowid: tercero.f200_rowid, f200_id: tercero.f200_id, f200_nit: tercero.f200_nit, accion } as const;
    for (const sucursal of datos.proveedor) {
      const campos = {
        f202_descripcion_sucursal: sucursal.descripcion,
        f202_ind_estado: sucursal.activa ? 1 : 0,
        f202_id_cond_pago: sucursal.condicionPago,
        f202_id_tipo_prov: sucursal.tipoProveedor,
        ...contacto,
      };
      await tx.proveedor.upsert({
        where: {
          f202_rowid_tercero_f202_id_sucursal: { f202_rowid_tercero: tercero.f200_rowid, f202_id_sucursal: sucursal.id },
        },
        create: { f202_rowid_tercero: tercero.f200_rowid, f202_id_sucursal: sucursal.id, ...campos },
        update: campos,
      });
      detalle.push({ ...base, tipo: "PROVEEDOR", sucursal: sucursal.id });
    }
    for (const sucursal of datos.cliente) {
      const campos = {
        f201_descripcion_sucursal: sucursal.descripcion,
        f201_ind_estado_activo: sucursal.activa ? 1 : 0,
        f201_id_cond_pago: sucursal.condicionPago,
        ...contacto,
      };
      await tx.cliente.upsert({
        where: {
          f201_rowid_tercero_f201_id_sucursal: { f201_rowid_tercero: tercero.f200_rowid, f201_id_sucursal: sucursal.id },
        },
        create: { f201_rowid_tercero: tercero.f200_rowid, f201_id_sucursal: sucursal.id, ...campos },
        update: campos,
      });
      detalle.push({ ...base, tipo: "CLIENTE", sucursal: sucursal.id });
    }
    return detalle;
  }
}
