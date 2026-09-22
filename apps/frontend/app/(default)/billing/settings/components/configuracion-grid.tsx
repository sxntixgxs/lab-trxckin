import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FacturacionUserPicker } from "../../components/user-picker";
import type { FacturacionUsuario } from "../../hooks/use-facturacion-users";
import type { AnalistaCausacionRow, CupoBloque10 } from "../lib/types";
import { AnalistasPonderadosEditor } from "./analistas-ponderados-editor";
import { ConfigCard } from "./config-card";
import { GerenciasListaEditor } from "./gerencias-lista-editor";
import { ProveedoresCausacionEditor } from "./proveedores-causacion-editor";
import { UsuariosListaEditor } from "./usuarios-lista-editor";

type ConfiguracionFacturacionState = {
  recepcionIds: string[];
  setRecepcionIds: (ids: string[]) => void;
  contadoresIds: string[];
  setContadoresIds: (ids: string[]) => void;
  contadoresPeajesIds: string[];
  setContadoresPeajesIds: (ids: string[]) => void;
  eventosDianIds: string[];
  setEventosDianIds: (ids: string[]) => void;
  revisorCajaMenorIds: string[];
  setRevisorCajaMenorIds: (ids: string[]) => void;
  notificacionPagadasIds: string[];
  setNotificacionPagadasIds: (ids: string[]) => void;
  notificacionLegalizadasIds: string[];
  setNotificacionLegalizadasIds: (ids: string[]) => void;
  notificacionRechazadoDianIds: string[];
  setNotificacionRechazadoDianIds: (ids: string[]) => void;
  gerenciaIds: string[];
  setGerenciaIds: (ids: string[]) => void;
  gerenciaDefaultId: string | null;
  setGerenciaDefaultId: (id: string | null) => void;
  tesoreroId: string | null;
  setTesoreroId: (id: string | null) => void;
  analistasCausacion: AnalistaCausacionRow[];
  rechazosDian: AnalistaCausacionRow[];
  revisoresCajaMenor: AnalistaCausacionRow[];
  cuentaRecepcion: string;
  setCuentaRecepcion: (value: string) => void;
  cuentaRecepcionGraphDeshabilitada: boolean;
  setCuentaRecepcionGraphDeshabilitada: (value: boolean) => void;
  totalPesoCausacion: number;
  totalPesoRechazosDian: number;
  totalPesoRevisoresCajaMenor: number;
  cuposBloque10: CupoBloque10[];
  cuposBloque10RechazosDian: CupoBloque10[];
  cuposBloque10RevisoresCajaMenor: CupoBloque10[];
  updateAnalistaCausacionRow: (
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>
  ) => void;
  removeAnalistaCausacionRow: (rowId: string) => void;
  addAnalistaCausacionRow: () => void;
  updateRechazosDianRow: (
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>
  ) => void;
  removeRechazosDianRow: (rowId: string) => void;
  addRechazosDianRow: () => void;
  updateRevisoresCajaMenorRow: (
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>
  ) => void;
  removeRevisoresCajaMenorRow: (rowId: string) => void;
  addRevisoresCajaMenorRow: () => void;
  persistUserConfig: (
    key: "tesorero",
    userId: string | null,
    source: FacturacionUsuario[]
  ) => Promise<void>;
  persistGerencias: (
    selectedIds: string[],
    defaultId: string | null,
    source: FacturacionUsuario[]
  ) => Promise<void>;
  persistUserListConfig: (
    key:
      | "recepcion"
      | "contadores_impuestos"
      | "contadores_peajes"
      | "eventos_dian"
      | "revisor_caja_menor"
      | "notificacion_pagadas"
      | "notificacion_legalizadas"
      | "notificacion_rechazado_dian",
    selectedIds: string[],
    source: FacturacionUsuario[]
  ) => Promise<void>;
  persistAnalistasCausacion: () => Promise<void>;
  persistRechazosDian: () => Promise<void>;
  persistRevisoresCajaMenor: () => Promise<void>;
  persistCuentaRecepcion: () => Promise<void>;
  empresaConfig: number;
  actor: {
    actualizadoPorUserId?: string;
    actualizadoPorNombre?: string;
  };
};

export function ConfiguracionGrid({
  usuarios,
  usuariosFinanzas,
  state,
}: {
  usuarios: FacturacionUsuario[];
  usuariosFinanzas: FacturacionUsuario[];
  state: ConfiguracionFacturacionState;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ConfigCard
        title="Recepción"
        description="Usuarios que reciben las facturas importadas y asignan uno o varios líderes."
        action={
          <UsuariosListaEditor
            selectedIds={state.recepcionIds}
            usuarios={usuarios}
            placeholder="Agregar usuario de recepción..."
            emptyLabel="No hay usuarios de recepción configurados."
            onChange={state.setRecepcionIds}
            onSave={() =>
              void state.persistUserListConfig(
                "recepcion",
                state.recepcionIds,
                usuarios
              )
            }
          />
        }
      />

      <ConfigCard
        title="Cuenta de recepción"
        description="Correo monitoreado por Microsoft Graph para esta empresa."
        action={
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={state.cuentaRecepcion}
                  onChange={(event) =>
                    state.setCuentaRecepcion(event.target.value)
                  }
                  className="pl-9"
                  placeholder="recepcion.facturas@empresa.co"
                />
              </div>
              <Button onClick={() => void state.persistCuentaRecepcion()}>
                Guardar cuenta
              </Button>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <Checkbox
                id="facturacion-cuenta-recepcion-manual"
                checked={state.cuentaRecepcionGraphDeshabilitada}
                onCheckedChange={(checked) =>
                  state.setCuentaRecepcionGraphDeshabilitada(checked === true)
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <label
                  htmlFor="facturacion-cuenta-recepcion-manual"
                  className="text-sm font-medium text-slate-900"
                >
                  Carga manual, sin Microsoft Graph
                </label>
                <p className="text-xs leading-5 text-slate-500">
                  Esta empresa se omite del cron y del botón de sincronización
                  de bandeja.
                </p>
              </div>
            </div>
          </div>
        }
      />

      <ConfigCard
        title="Analistas de causación"
        description="Distribución automática en bloques ponderados por empresa."
        action={
          <div className="space-y-4">
            <AnalistasPonderadosEditor
              rows={state.analistasCausacion}
              usuarios={usuariosFinanzas}
              totalPeso={state.totalPesoCausacion}
              cuposBloque10={state.cuposBloque10}
              heading="Analistas y peso"
              addLabel="Agregar analista"
              blockTitle="Bloque automático de 10 facturas"
              userPlaceholder={(index) => `Analista ${index + 1}`}
              onChange={state.updateAnalistaCausacionRow}
              onRemove={state.removeAnalistaCausacionRow}
              onAdd={state.addAnalistaCausacionRow}
              onSave={() => void state.persistAnalistasCausacion()}
            />
            <ProveedoresCausacionEditor
              empresaConfig={state.empresaConfig}
              analistasCausacion={state.analistasCausacion}
              usuariosFinanzas={usuariosFinanzas}
              actor={state.actor}
            />
          </div>
        }
      />

      <ConfigCard
        title="Rechazos DIAN"
        description="Usuarios que reciben facturas pendientes de confirmar rechazo ante la DIAN."
        action={
          <AnalistasPonderadosEditor
            rows={state.rechazosDian}
            usuarios={usuariosFinanzas}
            totalPeso={state.totalPesoRechazosDian}
            cuposBloque10={state.cuposBloque10RechazosDian}
            heading="Usuarios y peso"
            addLabel="Agregar usuario"
            blockTitle="Bloque automático de 10 rechazos"
            userPlaceholder={(index) => `Usuario ${index + 1}`}
            onChange={state.updateRechazosDianRow}
            onRemove={state.removeRechazosDianRow}
            onAdd={state.addRechazosDianRow}
            onSave={() => void state.persistRechazosDian()}
          />
        }
      />

      <ConfigCard
        title="Contadores / revisores de impuestos"
        description="Lista de revisores que causación puede seleccionar antes de Eventos DIAN."
        action={
          <UsuariosListaEditor
            selectedIds={state.contadoresIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar contador o revisor..."
            emptyLabel="No hay revisores configurados."
            onChange={state.setContadoresIds}
            onSave={() =>
              void state.persistUserListConfig(
                "contadores_impuestos",
                state.contadoresIds,
                usuariosFinanzas
              )
            }
          />
        }
      />

      <ConfigCard
        title="Contabilidad PEAJES"
        description="Usuarios autorizados para revisar, contabilizar y reabrir facturas PEAJES de esta empresa"
        action={
          <UsuariosListaEditor
            selectedIds={state.contadoresPeajesIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar contador PEAJES..."
            emptyLabel="No hay contadores PEAJES configurados."
            onChange={state.setContadoresPeajesIds}
            onSave={() =>
              void state.persistUserListConfig(
                "contadores_peajes",
                state.contadoresPeajesIds,
                usuariosFinanzas
              )
            }
          />
        }
      />

      <ConfigCard
        title="Eventos DIAN"
        description="Usuarios que reciben facturas y reembolsos de Caja Menor después de Contabilidad, antes de Gerencia Financiera."
        action={
          <UsuariosListaEditor
            selectedIds={state.eventosDianIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar usuario de Eventos DIAN..."
            emptyLabel="No hay usuarios de Eventos DIAN configurados."
            onChange={state.setEventosDianIds}
            onSave={() =>
              void state.persistUserListConfig(
                "eventos_dian",
                state.eventosDianIds,
                usuariosFinanzas
              )
            }
          />
        }
      />

      <ConfigCard
        title="Revisores Caja Menor y peso"
        description="Usuarios que revisan solicitudes de reembolso con distribución automática en bloques de 10."
        action={
          <AnalistasPonderadosEditor
            rows={state.revisoresCajaMenor}
            usuarios={usuariosFinanzas}
            totalPeso={state.totalPesoRevisoresCajaMenor}
            cuposBloque10={state.cuposBloque10RevisoresCajaMenor}
            heading="Revisores y peso"
            addLabel="Agregar revisor"
            blockTitle="Bloque automático de 10 solicitudes"
            userPlaceholder={(index) => `Revisor ${index + 1}`}
            onChange={state.updateRevisoresCajaMenorRow}
            onRemove={state.removeRevisoresCajaMenorRow}
            onAdd={state.addRevisoresCajaMenorRow}
            onSave={() => void state.persistRevisoresCajaMenor()}
          />
        }
      />

      <ConfigCard
        title="Gerencia"
        description="Usuarios de gerencia que pueden aprobar facturas. El default recibe la asignación automática."
        action={
          <GerenciasListaEditor
            selectedIds={state.gerenciaIds}
            defaultId={state.gerenciaDefaultId}
            usuarios={usuarios}
            placeholder="Agregar usuario de gerencia..."
            emptyLabel="No hay usuarios de gerencia configurados."
            onChange={state.setGerenciaIds}
            onDefaultChange={state.setGerenciaDefaultId}
            onSave={() =>
              void state.persistGerencias(
                state.gerenciaIds,
                state.gerenciaDefaultId,
                usuarios
              )
            }
          />
        }
      />

      <ConfigCard
        title="Tesorero"
        description="Responsable final de soportar y marcar la factura como pagada."
        action={
          <>
            <FacturacionUserPicker
              value={state.tesoreroId}
              onChange={state.setTesoreroId}
              usuarios={usuariosFinanzas}
              placeholder="Seleccionar tesorero..."
            />
            <Button
              onClick={() =>
                void state.persistUserConfig(
                  "tesorero",
                  state.tesoreroId,
                  usuariosFinanzas
                )
              }
            >
              Guardar tesorero
            </Button>
          </>
        }
      />

      <ConfigCard
        title="Avisos de facturas pagadas"
        description="Usuarios que reciben correo cuando una factura queda marcada como pagada."
        action={
          <UsuariosListaEditor
            selectedIds={state.notificacionPagadasIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar usuario para pagadas..."
            emptyLabel="No hay destinatarios para facturas pagadas."
            onChange={state.setNotificacionPagadasIds}
            onSave={() =>
              void state.persistUserListConfig(
                "notificacion_pagadas",
                state.notificacionPagadasIds,
                usuariosFinanzas
              )
            }
          />
        }
      />

      <ConfigCard
        title="Avisos de facturas legalizadas"
        description="Usuarios que reciben correo cuando una factura queda legalizada."
        action={
          <UsuariosListaEditor
            selectedIds={state.notificacionLegalizadasIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar usuario para legalizadas..."
            emptyLabel="No hay destinatarios para facturas legalizadas."
            onChange={state.setNotificacionLegalizadasIds}
            onSave={() =>
              void state.persistUserListConfig(
                "notificacion_legalizadas",
                state.notificacionLegalizadasIds,
                usuariosFinanzas
              )
            }
          />
        }
      />

      <ConfigCard
        title="Avisos de rechazo DIAN"
        description="Usuarios que reciben correo cuando una factura queda como rechazada DIAN."
        action={
          <UsuariosListaEditor
            selectedIds={state.notificacionRechazadoDianIds}
            usuarios={usuariosFinanzas}
            placeholder="Agregar usuario para rechazo DIAN..."
            emptyLabel="No hay destinatarios para rechazo DIAN."
            onChange={state.setNotificacionRechazadoDianIds}
            onSave={() =>
              void state.persistUserListConfig(
                "notificacion_rechazado_dian",
                state.notificacionRechazadoDianIds,
                usuariosFinanzas
              )
            }
          />
        }
      />
    </div>
  );
}
