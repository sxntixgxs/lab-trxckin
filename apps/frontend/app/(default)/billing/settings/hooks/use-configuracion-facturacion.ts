"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  type FacturacionUsuario,
  useFacturacionUsers,
} from "../../hooks/use-facturacion-users";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import {
  calcularCuposBloque10,
  createAnalistaRow,
  type AnalistaCausacionRow,
  type ConfiguracionFacturacionItem,
  type UsuarioPonderadoConfig,
  type UsuariosListaConfigKey,
} from "../lib/types";

type Actor = {
  actualizadoPorUserId?: string;
  actualizadoPorNombre?: string;
};

function isValidPesoPonderado(value: string, peso: number) {
  return (
    value.trim() !== "" &&
    Number.isFinite(peso) &&
    Number.isInteger(peso) &&
    peso >= 0
  );
}

export function useConfiguracionFacturacion(
  empresaConfig: number | null,
  actor: Actor,
) {
  const { usuarios, usuariosFinanzas, isLoading } = useFacturacionUsers({
    empresaId: empresaConfig,
    includeGlobalAccess: true,
    enabled: empresaConfig !== null,
  });
  const config = useQuery(
    api.facturacionConfiguracion.listar,
    empresaConfig !== null ? { empresa: empresaConfig } : "skip",
  );
  const saveUser = useMutation(api.facturacionConfiguracion.guardarUsuario);
  const saveUserList = useMutation(
    api.facturacionConfiguracion.guardarUsuariosLista,
  );
  const saveAnalistasCausacion = useMutation(
    api.facturacionConfiguracion.guardarAnalistasCausacion,
  );
  const saveRechazosDian = useMutation(
    api.facturacionConfiguracion.guardarRechazosDian,
  );
  const saveRevisoresCajaMenor = useMutation(
    api.facturacionConfiguracion.guardarRevisoresCajaMenor,
  );
  const saveGerencias = useMutation(api.facturacionConfiguracion.guardarGerencias);
  const saveCuentaRecepcion = useMutation(
    api.facturacionConfiguracion.guardarCuentaRecepcion,
  );

  const [recepcionIds, setRecepcionIds] = useState<string[]>([]);
  const [contadoresIds, setContadoresIds] = useState<string[]>([]);
  const [contadoresPeajesIds, setContadoresPeajesIds] = useState<string[]>([]);
  const [eventosDianIds, setEventosDianIds] = useState<string[]>([]);
  const [revisorCajaMenorIds, setRevisorCajaMenorIds] = useState<string[]>([]);
  const [notificacionPagadasIds, setNotificacionPagadasIds] = useState<string[]>([]);
  const [notificacionLegalizadasIds, setNotificacionLegalizadasIds] = useState<
    string[]
  >([]);
  const [notificacionRechazadoDianIds, setNotificacionRechazadoDianIds] =
    useState<string[]>([]);
  const [gerenciaIds, setGerenciaIds] = useState<string[]>([]);
  const [gerenciaDefaultId, setGerenciaDefaultId] = useState<string | null>(null);
  const [tesoreroId, setTesoreroId] = useState<string | null>(null);
  const [analistasCausacion, setAnalistasCausacion] = useState<
    AnalistaCausacionRow[]
  >([createAnalistaRow()]);
  const [rechazosDian, setRechazosDian] = useState<AnalistaCausacionRow[]>([
    createAnalistaRow(null, 100),
  ]);
  const [revisoresCajaMenor, setRevisoresCajaMenor] = useState<AnalistaCausacionRow[]>([
    createAnalistaRow(null, 100),
  ]);
  const [cuentaRecepcion, setCuentaRecepcion] = useState(
    "facturas@example.com",
  );
  const [
    cuentaRecepcionGraphDeshabilitada,
    setCuentaRecepcionGraphDeshabilitada,
  ] = useState(false);

  // Convex config seeds local, editable form state once per empresa. Later live updates
  // (including our own saves) must not overwrite edits the user has not saved yet.
  const initializedEmpresaRef = useRef<number | null>(null);
  useEffect(() => {
    if (!config || empresaConfig === null) return;
    if (initializedEmpresaRef.current === empresaConfig) return;
    initializedEmpresaRef.current = empresaConfig;
    const causacionConfig = config.analista_causacion as
      | ConfiguracionFacturacionItem
      | undefined;
    const rechazosDianConfig = config.rechazos_dian as
      | ConfiguracionFacturacionItem
      | undefined;
    const revisorCajaMenorConfig = config.revisor_caja_menor as
      | ConfiguracionFacturacionItem
      | undefined;
    const tesoreroConfig =
      (config.tesorero as ConfiguracionFacturacionItem | undefined) ??
      (config.tesoreria_default as ConfiguracionFacturacionItem | undefined);
    const gerenciaConfig =
      (config.gerencia as ConfiguracionFacturacionItem | undefined) ??
      (config.gerente_financiero as ConfiguracionFacturacionItem | undefined);
    const cuentaRecepcionConfig = config.cuenta_recepcion as
      | ConfiguracionFacturacionItem
      | undefined;

    setRecepcionIds(
      ((config.recepcion as ConfiguracionFacturacionItem | undefined)?.usuarios ??
        []).map((usuario) => usuario.usuarioId),
    );
    setContadoresIds(
      ((
        config.contadores_impuestos as ConfiguracionFacturacionItem | undefined
      )?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setContadoresPeajesIds(
      ((
        config.contadores_peajes as ConfiguracionFacturacionItem | undefined
      )?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setEventosDianIds(
      ((config.eventos_dian as ConfiguracionFacturacionItem | undefined)
        ?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setRevisorCajaMenorIds(
      (revisorCajaMenorConfig?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setNotificacionPagadasIds(
      ((config.notificacion_pagadas as ConfiguracionFacturacionItem | undefined)
        ?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setNotificacionLegalizadasIds(
      ((
        config.notificacion_legalizadas as ConfiguracionFacturacionItem | undefined
      )?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setNotificacionRechazadoDianIds(
      ((
        config.notificacion_rechazado_dian as
          | ConfiguracionFacturacionItem
          | undefined
      )?.usuarios ?? []).map((usuario) => usuario.usuarioId),
    );
    setGerenciaIds(
      gerenciaConfig?.usuarios?.map((usuario) => usuario.usuarioId) ??
        (gerenciaConfig?.usuarioId ? [gerenciaConfig.usuarioId] : []),
    );
    setGerenciaDefaultId(
      gerenciaConfig?.usuarios?.[0]?.usuarioId ??
        gerenciaConfig?.usuarioId ??
        null,
    );
    setTesoreroId(tesoreroConfig?.usuarioId ?? null);
    setCuentaRecepcion(
      cuentaRecepcionConfig
        ? (cuentaRecepcionConfig.valor ?? "")
        : "facturas@example.com",
    );
    setCuentaRecepcionGraphDeshabilitada(
      cuentaRecepcionConfig?.sincronizacionGraphDeshabilitada === true,
    );

    if (
      causacionConfig?.usuariosPonderados &&
      causacionConfig.usuariosPonderados.length > 0
    ) {
      setAnalistasCausacion(
        causacionConfig.usuariosPonderados.map((usuario) =>
          createAnalistaRow(usuario.usuarioId, usuario.peso),
        ),
      );
    } else if (causacionConfig?.usuarioId) {
      setAnalistasCausacion([createAnalistaRow(causacionConfig.usuarioId, 100)]);
    } else {
      setAnalistasCausacion([createAnalistaRow()]);
    }

    if (
      rechazosDianConfig?.usuariosPonderados &&
      rechazosDianConfig.usuariosPonderados.length > 0
    ) {
      setRechazosDian(
        rechazosDianConfig.usuariosPonderados.map((usuario) =>
          createAnalistaRow(usuario.usuarioId, usuario.peso),
        ),
      );
    } else if (rechazosDianConfig?.usuarioId) {
      setRechazosDian([createAnalistaRow(rechazosDianConfig.usuarioId, 100)]);
    } else {
      setRechazosDian([createAnalistaRow(null, 100)]);
    }

    if (
      revisorCajaMenorConfig?.usuariosPonderados &&
      revisorCajaMenorConfig.usuariosPonderados.length > 0
    ) {
      setRevisoresCajaMenor(
        revisorCajaMenorConfig.usuariosPonderados.map((usuario) =>
          createAnalistaRow(usuario.usuarioId, usuario.peso),
        ),
      );
    } else if (revisorCajaMenorConfig?.usuarios?.length) {
      const count = revisorCajaMenorConfig.usuarios.length;
      const pesoBase = Math.floor(100 / count);
      const remainder = 100 - pesoBase * count;
      setRevisoresCajaMenor(
        revisorCajaMenorConfig.usuarios.map((usuario, index) =>
          createAnalistaRow(
            usuario.usuarioId,
            count === 1 ? 100 : pesoBase + (index === 0 ? remainder : 0),
          ),
        ),
      );
    } else if (revisorCajaMenorConfig?.usuarioId) {
      setRevisoresCajaMenor([
        createAnalistaRow(revisorCajaMenorConfig.usuarioId, 100),
      ]);
    } else {
      setRevisoresCajaMenor([createAnalistaRow(null, 100)]);
    }
  }, [config, empresaConfig]);

  async function persistGerencias(
    selectedIds: string[],
    defaultId: string | null,
    source: FacturacionUsuario[],
  ) {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const selectedUsers = selectedIds.map((id) =>
      source.find((usuario) => usuario.id === id),
    );
    if (selectedUsers.length === 0 || selectedUsers.some((item) => !item)) {
      toast.error("Completa la lista con usuarios válidos antes de guardar.");
      return;
    }

    const defaultUsuarioId =
      selectedUsers.length === 1
        ? selectedUsers[0]!.id
        : defaultId && selectedUsers.some((usuario) => usuario!.id === defaultId)
          ? defaultId
          : selectedUsers[0]!.id;

    try {
      await saveGerencias({
        empresa: empresaConfig,
        usuarios: selectedUsers.map((usuario) => ({
          usuarioId: usuario!.id,
          nombre: usuario!.nombre,
          email: usuario!.email,
        })),
        defaultUsuarioId,
        ...actor,
      });
      toast.success("Gerencias actualizadas.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  async function persistUserConfig(
    key: "tesorero",
    userId: string | null,
    source: FacturacionUsuario[],
  ) {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const user = source.find((item) => item.id === userId);
    if (!user) {
      toast.error("Selecciona un usuario válido antes de guardar.");
      return;
    }

    try {
      await saveUser({
        empresa: empresaConfig,
        clave: key,
        usuarioId: user.id,
        nombre: user.nombre,
        email: user.email,
        ...actor,
      });
      toast.success("Configuración actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  async function persistUserListConfig(
    key: UsuariosListaConfigKey,
    selectedIds: string[],
    source: FacturacionUsuario[],
  ) {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const selectedUsers = selectedIds.map((id) =>
      source.find((usuario) => usuario.id === id),
    );
    if (selectedUsers.length === 0 || selectedUsers.some((item) => !item)) {
      toast.error("Completa la lista con usuarios válidos antes de guardar.");
      return;
    }

    try {
      await saveUserList({
        empresa: empresaConfig,
        clave: key,
        usuarios: selectedUsers.map((usuario) => ({
          usuarioId: usuario!.id,
          nombre: usuario!.nombre,
          email: usuario!.email,
        })),
        ...actor,
      });
      toast.success("Lista actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  const totalPesoCausacion = useMemo(
    () =>
      analistasCausacion.reduce((total, row) => {
        const peso = Number(row.peso);
        return total + (Number.isFinite(peso) ? peso : 0);
      }, 0),
    [analistasCausacion],
  );
  const totalPesoRechazosDian = useMemo(
    () =>
      rechazosDian.reduce((total, row) => {
        const peso = Number(row.peso);
        return total + (Number.isFinite(peso) ? peso : 0);
      }, 0),
    [rechazosDian],
  );
  const totalPesoRevisoresCajaMenor = useMemo(
    () =>
      revisoresCajaMenor.reduce((total, row) => {
        const peso = Number(row.peso);
        return total + (Number.isFinite(peso) ? peso : 0);
      }, 0),
    [revisoresCajaMenor],
  );

  const cuposBloque10 = useMemo(() => {
    const rows = analistasCausacion
      .map((row) => {
        const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
        const peso = Number(row.peso);
        if (!usuario || !Number.isFinite(peso) || peso <= 0) return null;
        return {
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          peso,
        };
      })
      .filter((item): item is { usuarioId: string; nombre: string; peso: number } =>
        Boolean(item),
      );
    return calcularCuposBloque10(rows);
  }, [analistasCausacion, usuariosFinanzas]);

  const cuposBloque10RechazosDian = useMemo(() => {
    const rows = rechazosDian
      .map((row) => {
        const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
        const peso = Number(row.peso);
        if (!usuario || !Number.isFinite(peso) || peso <= 0) return null;
        return {
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          peso,
        };
      })
      .filter((item): item is { usuarioId: string; nombre: string; peso: number } =>
        Boolean(item),
      );
    return calcularCuposBloque10(rows);
  }, [rechazosDian, usuariosFinanzas]);

  const cuposBloque10RevisoresCajaMenor = useMemo(() => {
    const rows = revisoresCajaMenor
      .map((row) => {
        const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
        const peso = Number(row.peso);
        if (!usuario || !Number.isFinite(peso) || peso <= 0) return null;
        return {
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          peso,
        };
      })
      .filter((item): item is { usuarioId: string; nombre: string; peso: number } =>
        Boolean(item),
      );
    return calcularCuposBloque10(rows);
  }, [revisoresCajaMenor, usuariosFinanzas]);

  function updateAnalistaCausacionRow(
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>,
  ) {
    setAnalistasCausacion((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  }

  function removeAnalistaCausacionRow(rowId: string) {
    setAnalistasCausacion((prev) =>
      prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev,
    );
  }

  function addAnalistaCausacionRow() {
    setAnalistasCausacion((prev) => [...prev, createAnalistaRow(null, 0)]);
  }

  function updateRechazosDianRow(
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>,
  ) {
    setRechazosDian((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  }

  function removeRechazosDianRow(rowId: string) {
    setRechazosDian((prev) =>
      prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev,
    );
  }

  function addRechazosDianRow() {
    setRechazosDian((prev) => [...prev, createAnalistaRow(null, 0)]);
  }

  function updateRevisoresCajaMenorRow(
    rowId: string,
    patch: Partial<Omit<AnalistaCausacionRow, "rowId">>,
  ) {
    setRevisoresCajaMenor((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  }

  function removeRevisoresCajaMenorRow(rowId: string) {
    setRevisoresCajaMenor((prev) =>
      prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev,
    );
  }

  function addRevisoresCajaMenorRow() {
    setRevisoresCajaMenor((prev) => [...prev, createAnalistaRow(null, 0)]);
  }

  async function persistAnalistasCausacion() {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const usuariosConfig: UsuarioPonderadoConfig[] = [];
    const seen = new Set<string>();

    for (const row of analistasCausacion) {
      const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
      const peso = Number(row.peso);

      if (!usuario) {
        toast.error("Selecciona todos los analistas antes de guardar.");
        return;
      }

      if (seen.has(usuario.id)) {
        toast.error("No repitas analistas en la distribución.");
        return;
      }

      if (!isValidPesoPonderado(row.peso, peso)) {
        toast.error("Cada analista debe tener un peso entero entre 0 y 100.");
        return;
      }

      seen.add(usuario.id);
      usuariosConfig.push({
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        peso,
      });
    }

    const total = usuariosConfig.reduce((acc, usuario) => acc + usuario.peso, 0);
    if (!usuariosConfig.some((usuario) => usuario.peso > 0)) {
      toast.error("Configura al menos un analista con peso mayor a 0.");
      return;
    }

    if (total !== 100) {
      toast.error("La distribución de causación debe sumar 100%.");
      return;
    }

    try {
      await saveAnalistasCausacion({
        empresa: empresaConfig,
        usuarios: usuariosConfig,
        ...actor,
      });
      toast.success("Distribución de causación actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  async function persistRechazosDian() {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const usuariosConfig: UsuarioPonderadoConfig[] = [];
    const seen = new Set<string>();

    for (const row of rechazosDian) {
      const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
      const peso = Number(row.peso);

      if (!usuario) {
        toast.error("Selecciona todos los usuarios de Rechazos DIAN antes de guardar.");
        return;
      }

      if (seen.has(usuario.id)) {
        toast.error("No repitas usuarios en la distribución de Rechazos DIAN.");
        return;
      }

      if (!isValidPesoPonderado(row.peso, peso)) {
        toast.error(
          "Cada usuario de Rechazos DIAN debe tener un peso entero entre 0 y 100.",
        );
        return;
      }

      seen.add(usuario.id);
      usuariosConfig.push({
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        peso,
      });
    }

    const total = usuariosConfig.reduce((acc, usuario) => acc + usuario.peso, 0);
    if (!usuariosConfig.some((usuario) => usuario.peso > 0)) {
      toast.error(
        "Configura al menos un usuario de Rechazos DIAN con peso mayor a 0.",
      );
      return;
    }

    if (total !== 100) {
      toast.error("La distribución de Rechazos DIAN debe sumar 100%.");
      return;
    }

    try {
      await saveRechazosDian({
        empresa: empresaConfig,
        usuarios: usuariosConfig,
        ...actor,
      });
      toast.success("Distribución de Rechazos DIAN actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  async function persistRevisoresCajaMenor() {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    const usuariosConfig: UsuarioPonderadoConfig[] = [];
    const seen = new Set<string>();

    for (const row of revisoresCajaMenor) {
      const usuario = usuariosFinanzas.find((item) => item.id === row.usuarioId);
      const peso = Number(row.peso);

      if (!usuario) {
        toast.error("Selecciona todos los revisores antes de guardar.");
        return;
      }

      if (seen.has(usuario.id)) {
        toast.error("No repitas revisores en la distribución.");
        return;
      }

      if (!isValidPesoPonderado(row.peso, peso)) {
        toast.error("Cada revisor debe tener un peso entero entre 0 y 100.");
        return;
      }

      seen.add(usuario.id);
      usuariosConfig.push({
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        peso,
      });
    }

    const total = usuariosConfig.reduce((acc, usuario) => acc + usuario.peso, 0);
    if (!usuariosConfig.some((usuario) => usuario.peso > 0)) {
      toast.error("Configura al menos un revisor con peso mayor a 0.");
      return;
    }

    if (total !== 100) {
      toast.error("La distribución de Revisores Caja Menor debe sumar 100%.");
      return;
    }

    try {
      await saveRevisoresCajaMenor({
        empresa: empresaConfig,
        usuarios: usuariosConfig,
        ...actor,
      });
      toast.success("Distribución de Revisores Caja Menor actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  async function persistCuentaRecepcion() {
    if (empresaConfig === null) {
      toast.error("Selecciona una empresa antes de guardar.");
      return;
    }

    if (!cuentaRecepcionGraphDeshabilitada && !cuentaRecepcion.trim()) {
      toast.error("Ingresa la cuenta de recepción para sincronizar Graph.");
      return;
    }

    try {
      await saveCuentaRecepcion({
        empresa: empresaConfig,
        valor: cuentaRecepcion,
        sincronizacionGraphDeshabilitada:
          cuentaRecepcionGraphDeshabilitada,
        ...actor,
      });
      toast.success("Cuenta de recepción actualizada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar la configuración. Intenta nuevamente.",
        ),
      );
    }
  }

  return {
    config,
    usuarios,
    usuariosFinanzas,
    isLoading,
    recepcionIds,
    setRecepcionIds,
    contadoresIds,
    setContadoresIds,
    contadoresPeajesIds,
    setContadoresPeajesIds,
    eventosDianIds,
    setEventosDianIds,
    revisorCajaMenorIds,
    setRevisorCajaMenorIds,
    notificacionPagadasIds,
    setNotificacionPagadasIds,
    notificacionLegalizadasIds,
    setNotificacionLegalizadasIds,
    notificacionRechazadoDianIds,
    setNotificacionRechazadoDianIds,
    gerenciaIds,
    setGerenciaIds,
    gerenciaDefaultId,
    setGerenciaDefaultId,
    tesoreroId,
    setTesoreroId,
    analistasCausacion,
    rechazosDian,
    revisoresCajaMenor,
    cuentaRecepcion,
    setCuentaRecepcion,
    cuentaRecepcionGraphDeshabilitada,
    setCuentaRecepcionGraphDeshabilitada,
    totalPesoCausacion,
    totalPesoRechazosDian,
    totalPesoRevisoresCajaMenor,
    cuposBloque10,
    cuposBloque10RechazosDian,
    cuposBloque10RevisoresCajaMenor,
    updateAnalistaCausacionRow,
    removeAnalistaCausacionRow,
    addAnalistaCausacionRow,
    updateRechazosDianRow,
    removeRechazosDianRow,
    addRechazosDianRow,
    updateRevisoresCajaMenorRow,
    removeRevisoresCajaMenorRow,
    addRevisoresCajaMenorRow,
    persistUserConfig,
    persistGerencias,
    persistUserListConfig,
    persistAnalistasCausacion,
    persistRechazosDian,
    persistRevisoresCajaMenor,
    persistCuentaRecepcion,
  };
}
