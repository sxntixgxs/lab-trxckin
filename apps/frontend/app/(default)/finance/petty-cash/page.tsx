"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/hooks/useCurrentUser";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import NoAutorizado from "@/app/no-autorizado";
import {
  KpiTile,
  ReembolsoAprobacionQueue,
  ReembolsoContabilidadQueue,
  ReembolsoEventosDianQueue,
  type ReembolsoModalTarget,
  type ReembolsoQueueItem,
  ReembolsoReciboQueue,
  ReembolsoReviewDialog,
  ReembolsoRevisionQueue,
} from "@/components/cajas-menores";
import { DashboardHero } from "@/components/dashboard-hero";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useHasAccess } from "@/hooks/useHasAccess";
import {
  getMutationErrorMessage,
  getSaldoDisponibleTone,
  parseMoneyInput,
} from "@/lib/cajas-menores";
import { formatCOP } from "@/lib/format";
import { EMPRESAS_LIST, EMPRESAS_MAP } from "@/lib/empresas";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import {
  type FacturacionUsuario,
  mergeFacturacionUsuarios,
  useFacturacionUsers,
} from "../../billing/hooks/use-facturacion-users";
import Loading from "../../loading";

import { AnularCajaDialog } from "./_components/anular-caja-dialog";
import { CajaDetailDialog } from "./_components/caja-detail-dialog";
import { CajaFormDialog } from "./_components/caja-form-dialog";
import { CajasTable } from "./_components/cajas-table";
import { GerenciaConfigPanel } from "./_components/gerencia-config-panel";
import { PermitirSaldoNegativoDialog } from "./_components/permitir-saldo-negativo-dialog";
import { RefillDialog } from "./_components/refill-dialog";
import { type CajaFormState, type CajaRow, emptyCajaForm } from "./_components/types";

export default function CajasMenoresPage() {
  const { data: session, status } = useSession();
  const hasRouteAccess = useHasAccess(RUTAS_SISTEMA.FINANZAS_CAJAS_MENORES);
  const {
    empresaActiva: empresaGlobalActiva,
    empresasDisponibles,
    empresaActivaInfo,
    opcionesSelector: opcionesGlobalSelector,
    canAccessAllEmpresas,
  } = useEmpresaFilter();
  const [pageEmpresaActiva, setPageEmpresaActiva] = useState<number | null>(null);
  const { usuarios, isLoading: usuariosLoading } = useFacturacionUsers();
  const actor = useMemo(
    () => ({
      actorUserId: session?.user?.id ?? "",
      actorNombre: session?.user?.nombre || session?.user?.email || "Usuario",
      actorEmail: session?.user?.email || "sin-correo@example.com",
      actorRol: session?.user?.id_rol,
    }),
    [session?.user]
  );
  const isAdmin = actor.actorRol === 1 || actor.actorRol === 99;
  const empresasRevisor = useQuery(
    api.cajasMenores.obtenerEmpresasRevisorCajaMenor,
    actor.actorUserId ? { actorUserId: actor.actorUserId } : "skip"
  );
  const empresaActiva = pageEmpresaActiva ?? empresaGlobalActiva;
  const opcionesPagina = useMemo(() => {
    const opciones = new Map<number | null, { id: number | null; nombre: string }>();
    if (canAccessAllEmpresas) {
      opciones.set(null, { id: null, nombre: "Todas las empresas" });
      for (const empresa of EMPRESAS_LIST) {
        opciones.set(empresa.id, { id: empresa.id, nombre: empresa.nombre });
      }
      return Array.from(opciones.values());
    }
    for (const opcion of opcionesGlobalSelector) {
      opciones.set(opcion.id, { id: opcion.id, nombre: opcion.nombre });
    }
    for (const empresaId of empresasRevisor ?? []) {
      if (!opciones.has(empresaId)) {
        const info = EMPRESAS_MAP[empresaId];
        opciones.set(empresaId, {
          id: empresaId,
          nombre: info?.nombre ?? `Empresa ${empresaId}`,
        });
      }
    }
    return Array.from(opciones.values());
  }, [canAccessAllEmpresas, empresasRevisor, opcionesGlobalSelector]);
  const empresasParaFiltro = useMemo(() => {
    if (empresaActiva !== null) return [empresaActiva];
    if (canAccessAllEmpresas) return [];
    const ids = new Set<number>([...empresasDisponibles, ...(empresasRevisor ?? [])]);
    return Array.from(ids);
  }, [canAccessAllEmpresas, empresaActiva, empresasDisponibles, empresasRevisor]);
  const empresaActivaInfoPagina =
    empresaActiva !== null ? EMPRESAS_MAP[empresaActiva] : empresaActivaInfo;
  const empresaConfig =
    typeof empresaActiva === "number"
      ? empresaActiva
      : (opcionesPagina.find((opcion) => opcion.id !== null)?.id ?? null);
  const [mostrarAnuladas, setMostrarAnuladas] = useState(false);

  const cajas = useQuery(
    api.cajasMenores.obtenerCajas,
    actor.actorUserId
      ? {
          ...(empresasParaFiltro.length > 0 ? { empresas: empresasParaFiltro } : {}),
          incluirAnuladas: mostrarAnuladas,
          actorUserId: actor.actorUserId,
          actorRol: actor.actorRol,
        }
      : "skip"
  ) as CajaRow[] | undefined;
  const canManageEmpresa = useQuery(
    api.cajasMenores.usuarioPuedeGestionar,
    actor.actorUserId && empresaConfig !== null
      ? {
          empresa: empresaConfig,
          actorUserId: actor.actorUserId,
          actorRol: actor.actorRol,
        }
      : "skip"
  );
  const configCajaMenorEmpresa = useQuery(
    api.cajasMenores.obtenerConfigCajaMenorEmpresa,
    typeof empresaActiva === "number" ? { empresa: empresaActiva } : "skip"
  );
  const canReviewReembolsos = useQuery(
    api.cajasMenores.usuarioPuedeRevisarCajaMenor,
    actor.actorUserId && empresaConfig !== null
      ? {
          empresa: empresaConfig,
          actorUserId: actor.actorUserId,
          actorRol: actor.actorRol,
        }
      : "skip"
  );
  const rolesConfig = useQuery(
    api.cajasMenores.obtenerRolesConfig,
    empresaConfig !== null ? { empresa: empresaConfig } : "skip"
  ) as Doc<"cajasMenoresRolesConfig">[] | undefined;
  const dashboardReembolsos = useQuery(
    api.cajasMenores.obtenerDashboardReembolsos,
    actor.actorUserId
      ? {
          ...(empresasParaFiltro.length > 0 ? { empresas: empresasParaFiltro } : {}),
          incluirAnuladas: mostrarAnuladas,
          actorUserId: actor.actorUserId,
          actorRol: actor.actorRol,
        }
      : "skip"
  );

  const crearCaja = useMutation(api.cajasMenores.crearCajaMenor);
  const actualizarCaja = useMutation(api.cajasMenores.actualizarCajaMenor);
  const eliminarCaja = useMutation(api.cajasMenores.eliminarCajaMenor);
  const crearRefill = useMutation(api.cajasMenores.crearRefill);
  const confirmarRefill = useMutation(api.cajasMenores.confirmarReceiptRefill);
  const configurarGF = useMutation(api.cajasMenores.configurarGerenciaFinanciera);
  const confirmarRecepcion = useMutation(api.cajasMenores.confirmarRecepcionReembolsoCajaMenor);
  const configurarPermitirSaldoNegativo = useMutation(
    api.cajasMenores.configurarPermitirSaldoNegativo
  );

  const [activeTab, setActiveTab] = useState("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CajaRow | null>(null);
  const [form, setForm] = useState<CajaFormState>(emptyCajaForm);
  const [saving, setSaving] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [refillFor, setRefillFor] = useState<CajaRow | null>(null);
  const [refillValue, setRefillValue] = useState("");
  const [refillToUserId, setRefillToUserId] = useState<string | null>(null);
  const [refillObservations, setRefillObservations] = useState("");
  const [detailFor, setDetailFor] = useState<CajaRow | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ReembolsoModalTarget | null>(null);
  const [modalTarget, setModalTarget] = useState<ReembolsoQueueItem | null>(null);
  const [anularFor, setAnularFor] = useState<CajaRow | null>(null);
  const [saldoNegativoDialog, setSaldoNegativoDialog] = useState<{
    activating: boolean;
  } | null>(null);
  const [configIds, setConfigIds] = useState<string[]>([]);

  const detail = useQuery(
    api.cajasMenores.obtenerDetalleCaja,
    detailFor
      ? {
          cajaMenorId: detailFor._id,
          actorUserId: actor.actorUserId,
          actorRol: actor.actorRol,
        }
      : "skip"
  );

  const empresaCustodios =
    editing?.empresa_id ?? (typeof empresaActiva === "number" ? empresaActiva : null);
  const { usuarios: custodiosAsignables } = useFacturacionUsers({
    empresaId: empresaCustodios,
    includeGlobalAccess: true,
    enabled: empresaCustodios !== null,
  });
  const { usuarios: usuariosGerencia, isLoading: usuariosGerenciaLoading } = useFacturacionUsers({
    empresaId: empresaConfig,
    includeGlobalAccess: true,
    enabled: isAdmin && empresaConfig !== null,
  });
  const usuariosOperativos = useMemo(
    () => mergeFacturacionUsuarios(usuarios, custodiosAsignables),
    [custodiosAsignables, usuarios]
  );
  const usuariosParaCustodios = useMemo(() => {
    const selected = new Set(form.assignedUsersIds);
    const selectedFallback = usuariosOperativos.filter((usuario) => selected.has(usuario.id));
    return mergeFacturacionUsuarios(custodiosAsignables, selectedFallback);
  }, [custodiosAsignables, form.assignedUsersIds, usuariosOperativos]);
  const usuariosGerenciaById = useMemo(
    () => new Map(usuariosGerencia.map((usuario) => [usuario.id, usuario])),
    [usuariosGerencia]
  );
  const usuariosOperativosById = useMemo(
    () => new Map(usuariosOperativos.map((usuario) => [usuario.id, usuario])),
    [usuariosOperativos]
  );
  const rows = useMemo(() => cajas ?? [], [cajas]);
  const canManageAny = Boolean(dashboardReembolsos?.canManage || canManageEmpresa);
  const canGenerateAny = Boolean(
    dashboardReembolsos?.canGenerate || canManageEmpresa || canReviewReembolsos
  );
  const metrics = useMemo(() => {
    const activas = rows.filter((row) => row.estado !== "cerrada" && row.estado !== "anulado");
    const pendientesReembolso =
      dashboardReembolsos?.cajas.reduce(
        (total: number, caja: { pendientes: unknown[] }) => total + caja.pendientes.length,
        0
      ) ?? 0;
    return {
      total: rows.length,
      activas: activas.length,
      asignado: activas.reduce((sum, row) => sum + row.assignedValue, 0),
      refills: rows.reduce((sum, row) => sum + row.totalRefills, 0),
      legalizado: rows.reduce((sum, row) => sum + row.totalLegalizado, 0),
      disponible: activas.reduce((sum, row) => sum + row.saldoDisponible, 0),
      bloqueadas: activas.filter((row) => row.refillPendiente).length,
      pendientesReembolso,
      pendientesAprobacion: dashboardReembolsos?.pendientesAprobacion.length ?? 0,
      pendientesContabilidad: dashboardReembolsos?.pendientesContabilidad.length ?? 0,
      pendientesEventosDian: dashboardReembolsos?.pendientesEventosDian.length ?? 0,
      pendientesRecibo: dashboardReembolsos?.pendientesRecibo.length ?? 0,
    };
  }, [rows, dashboardReembolsos]);

  function openCreate() {
    setEditing(null);
    setForm(emptyCajaForm);
    setFormOpen(true);
  }

  function openEdit(row: CajaRow) {
    setEditing(row);
    setForm({
      nombre: row.nombre,
      assignedValue: String(row.assignedValue),
      assignedUsersIds: row.assignedUsersIds,
      observations: row.observations ?? "",
    });
    setFormOpen(true);
  }

  async function saveForm() {
    if (!actor.actorUserId) return;
    if (!editing && typeof empresaActiva !== "number") {
      toast.error("Selecciona una empresa concreta para crear la Caja Menor.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await actualizarCaja({
          cajaMenorId: editing._id,
          nombre: form.nombre,
          assignedUsersIds: form.assignedUsersIds,
          observations: form.observations || undefined,
          ...actor,
        });
      } else {
        const assignedValue = parseMoneyInput(form.assignedValue);
        await crearCaja({
          empresa_id: empresaActiva as number,
          nombre: form.nombre,
          assignedValue,
          assignedValueLetras: formatCOP(assignedValue),
          assignedUsersIds: form.assignedUsersIds,
          observations: form.observations || undefined,
          ...actor,
        });
      }
      toast.success("Caja Menor guardada.");
      setFormOpen(false);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  async function saveRefill() {
    if (!refillFor || !refillToUserId) return;
    const value = parseMoneyInput(refillValue);
    setSaving(true);
    try {
      await crearRefill({
        cajaMenorId: refillFor._id,
        refillValue: value,
        refillValueLetras: formatCOP(value),
        refillToUserId,
        refillObservations: refillObservations || undefined,
        ...actor,
      });
      toast.success("Refill creado. La caja queda bloqueada hasta confirmar recibo.");
      setRefillFor(null);
      setRefillValue("");
      setRefillToUserId(null);
      setRefillObservations("");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo crear el refill."));
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    if (!isAdmin || empresaConfig === null) return;
    const selected = configIds
      .map((id) => usuariosGerenciaById.get(id))
      .filter((usuario): usuario is FacturacionUsuario => Boolean(usuario));
    setSaving(true);
    try {
      await configurarGF({
        empresa: empresaConfig,
        usuarios: selected.map((usuario) => ({
          userId: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
        })),
        ...actor,
      });
      toast.success("Gerencia Financiera actualizada.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm(reembolsoId: Id<"cajasMenoresReembolsos">) {
    setLoadingKey(`confirm:${reembolsoId}`);
    try {
      await confirmarRecepcion({ reembolsoId, ...actor });
      toast.success("Recibo confirmado. Saldo actualizado y facturas legalizadas.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo confirmar."));
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleAnular() {
    if (!anularFor) return;
    const caja = anularFor;
    setLoadingKey(`anular:${caja._id}`);
    try {
      await eliminarCaja({ cajaMenorId: caja._id, ...actor });
      toast.success("Caja Menor anulada.");
      setAnularFor(null);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo anular."));
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleConfirmRefill(refillId: Id<"cajasMenoresRefills">) {
    try {
      await confirmarRefill({ refillId, ...actor });
      toast.success("Recibo confirmado.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo confirmar."));
    }
  }

  function requestTogglePermitirSaldoNegativo() {
    if (typeof empresaActiva !== "number" || !canManageEmpresa) return;
    setSaldoNegativoDialog({
      activating: !(configCajaMenorEmpresa?.permitirSaldoNegativo ?? false),
    });
  }

  async function confirmTogglePermitirSaldoNegativo() {
    if (!saldoNegativoDialog || typeof empresaActiva !== "number") return;
    setLoadingKey("config-saldo-negativo");
    try {
      await configurarPermitirSaldoNegativo({
        empresa: empresaActiva,
        permitirSaldoNegativo: saldoNegativoDialog.activating,
        ...actor,
      });
      toast.success(
        saldoNegativoDialog.activating
          ? "Permitir saldos negativos activado."
          : "Permitir saldos negativos desactivado."
      );
      setSaldoNegativoDialog(null);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "No se pudo guardar la configuración."));
    } finally {
      setLoadingKey(null);
    }
  }

  useEffect(() => {
    if (pageEmpresaActiva !== null) return;
    if (empresaGlobalActiva !== null) {
      setPageEmpresaActiva(empresaGlobalActiva);
      return;
    }
    const primeraOpcion = opcionesPagina.find((opcion) => opcion.id !== null);
    if (primeraOpcion?.id !== undefined) {
      setPageEmpresaActiva(primeraOpcion.id);
    }
  }, [empresaGlobalActiva, opcionesPagina, pageEmpresaActiva]);

  useEffect(() => {
    if (!rolesConfig) return;
    const nextConfigIds = rolesConfig[0]?.usuarios.map((usuario) => usuario.userId) ?? [];
    let active = true;
    queueMicrotask(() => {
      if (active) setConfigIds(nextConfigIds);
    });
    return () => {
      active = false;
    };
  }, [rolesConfig]);

  if (
    status === "loading" ||
    usuariosLoading ||
    (isAdmin && usuariosGerenciaLoading) ||
    cajas === undefined ||
    dashboardReembolsos === undefined ||
    empresasRevisor === undefined
  ) {
    return <Loading />;
  }
  const hasReviewerAccess = (empresasRevisor?.length ?? 0) > 0;
  if (!hasRouteAccess && canManageEmpresa === false && !hasReviewerAccess) {
    return <NoAutorizado />;
  }

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <DashboardHero
        title="Cajas Menores"
        description={
          empresaActivaInfoPagina
            ? `Gestión y saldos de Cajas Menores para ${empresaActivaInfoPagina.nombre}.`
            : "Gestión independiente de Cajas Menores, refills y legalizaciones de facturas."
        }
        icon={<WalletCards className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-emerald-950 to-slate-900"
      />

      <section className="flex flex-wrap items-center gap-2">
        {opcionesPagina.map((opcion) => (
          <Button
            key={opcion.id ?? "all"}
            type="button"
            variant={empresaActiva === opcion.id ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setPageEmpresaActiva(opcion.id)}
          >
            {opcion.nombre}
          </Button>
        ))}
        {canManageAny ? (
          <Button
            type="button"
            className="ml-auto rounded-xl"
            onClick={openCreate}
            disabled={typeof empresaActiva !== "number"}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Caja
          </Button>
        ) : null}
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="dashboard" className="rounded-lg">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="config" className="rounded-lg" disabled={!isAdmin}>
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-5 space-y-5">
          {canGenerateAny ? (
            <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Generación de reembolsos</p>
                    <p className="mt-1 text-teal-800">
                      Selecciona movimientos pendientes por caja y genera reembolsos desde
                      Facturación. Las aprobaciones y recibos se gestionan aquí abajo.
                    </p>
                  </div>
                </div>
                <Button asChild className="rounded-xl bg-teal-700 hover:bg-teal-800">
                  <Link href="/billing/petty-cash-reimbursement">Ir a Reembolso Caja Menor</Link>
                </Button>
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-9">
            <KpiTile label="Activas" value={String(metrics.activas)} />
            <KpiTile label="Asignado" value={formatCOP(metrics.asignado)} />
            <KpiTile label="Refills" value={formatCOP(metrics.refills)} />
            <KpiTile label="Legalizado" value={formatCOP(metrics.legalizado)} />
            <KpiTile
              label="Disponible"
              value={formatCOP(metrics.disponible)}
              tone={getSaldoDisponibleTone(metrics.disponible)}
            />
            <KpiTile label="Bloqueadas" value={String(metrics.bloqueadas)} tone="amber" />
            <KpiTile
              label="Pend. reembolso"
              value={String(metrics.pendientesReembolso)}
              tone="teal"
            />
            <KpiTile
              label="Por aprobar"
              value={String(metrics.pendientesAprobacion)}
              tone="amber"
            />
            <KpiTile
              label="Impuestos/Contabilidad"
              value={String(metrics.pendientesContabilidad)}
              tone="sky"
            />
            <KpiTile
              label="Eventos DIAN"
              value={String(metrics.pendientesEventosDian)}
              tone="teal"
            />
          </div>

          {dashboardReembolsos.canAccess ? (
            <ReembolsoRevisionQueue
              items={dashboardReembolsos.pendientesRevision}
              actor={actor}
              onReview={setModalTarget}
              onOpenDetails={(reembolso) =>
                setDetailsTarget({ _id: reembolso._id, estado: reembolso.estado })
              }
            />
          ) : null}

          {dashboardReembolsos.canAccess ? (
            <ReembolsoContabilidadQueue
              items={dashboardReembolsos.pendientesContabilidad}
              actor={actor}
              onReview={setModalTarget}
              onOpenDetails={(reembolso) =>
                setDetailsTarget({ _id: reembolso._id, estado: reembolso.estado })
              }
            />
          ) : null}

          {dashboardReembolsos.canAccess ? (
            <ReembolsoEventosDianQueue
              items={dashboardReembolsos.pendientesEventosDian}
              actor={actor}
              onReview={setModalTarget}
              onOpenDetails={(reembolso) =>
                setDetailsTarget({ _id: reembolso._id, estado: reembolso.estado })
              }
            />
          ) : null}

          {dashboardReembolsos.canAccess ? (
            <ReembolsoAprobacionQueue
              items={dashboardReembolsos.pendientesAprobacion}
              onOpenModal={setModalTarget}
            />
          ) : null}

          <ReembolsoReciboQueue
            items={dashboardReembolsos.pendientesRecibo}
            loadingKey={loadingKey}
            onConfirm={(reembolsoId) => void handleConfirm(reembolsoId)}
            onOpenModal={setModalTarget}
          />

          <CajasTable
            rows={rows}
            totalCount={metrics.total}
            mostrarAnuladas={mostrarAnuladas}
            onToggleAnuladas={() => setMostrarAnuladas((current) => !current)}
            usuariosById={usuariosOperativosById}
            onDetail={setDetailFor}
            onRefill={(row) => {
              setRefillFor(row);
              setRefillToUserId(row.assignedUsersIds[0] ?? null);
            }}
            onEdit={openEdit}
            onAnular={setAnularFor}
            showPermitirSaldoNegativo={
              typeof empresaActiva === "number" && Boolean(canManageEmpresa)
            }
            permitirSaldoNegativo={configCajaMenorEmpresa?.permitirSaldoNegativo ?? false}
            onRequestTogglePermitirSaldoNegativo={requestTogglePermitirSaldoNegativo}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-5">
          {isAdmin ? (
            <GerenciaConfigPanel
              empresaConfig={empresaConfig}
              usuarios={usuariosGerencia}
              configIds={configIds}
              onChange={setConfigIds}
              saving={saving}
              onSave={() => void saveConfig()}
            />
          ) : (
            <NoAutorizado />
          )}
        </TabsContent>
      </Tabs>

      <CajaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        form={form}
        onFormChange={setForm}
        usuarios={usuariosParaCustodios}
        saving={saving}
        onSubmit={() => void saveForm()}
      />

      <RefillDialog
        refillFor={refillFor}
        refillValue={refillValue}
        onRefillValueChange={setRefillValue}
        refillToUserId={refillToUserId}
        onRefillToUserIdChange={setRefillToUserId}
        refillObservations={refillObservations}
        onRefillObservationsChange={setRefillObservations}
        usuarios={usuariosOperativos}
        saving={saving}
        onSubmit={() => void saveRefill()}
        onClose={() => setRefillFor(null)}
      />

      <CajaDetailDialog
        detailFor={detailFor}
        detail={detail}
        actorUserId={actor.actorUserId}
        usuariosById={usuariosOperativosById}
        onSelectReembolso={(reembolso) =>
          setDetailsTarget({ _id: reembolso._id, estado: reembolso.estado })
        }
        onConfirmRefill={handleConfirmRefill}
        onClose={() => setDetailFor(null)}
      />

      <ReembolsoReviewDialog
        mode="readonly"
        reembolso={detailsTarget}
        actor={actor}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      />

      <ReembolsoReviewDialog
        mode="action"
        reembolso={modalTarget}
        actor={actor}
        onOpenChange={(open) => {
          if (!open) setModalTarget(null);
        }}
      />

      <AnularCajaDialog
        anularFor={anularFor}
        isLoading={Boolean(loadingKey?.startsWith("anular:"))}
        onConfirm={() => void handleAnular()}
        onOpenChange={(open) => {
          if (!open) setAnularFor(null);
        }}
      />

      <PermitirSaldoNegativoDialog
        open={Boolean(saldoNegativoDialog)}
        activating={saldoNegativoDialog?.activating ?? false}
        isLoading={loadingKey === "config-saldo-negativo"}
        onConfirm={() => void confirmTogglePermitirSaldoNegativo()}
        onOpenChange={(open) => {
          if (!open) setSaldoNegativoDialog(null);
        }}
      />
    </div>
  );
}
