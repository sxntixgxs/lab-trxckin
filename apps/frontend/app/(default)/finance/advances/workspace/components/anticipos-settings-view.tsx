"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { getEmpresaNombre } from "@/lib/empresas";

import {
  emptyConfigDraft,
} from "../../dashboard/constants";
import type {
  AnticiposConfigDraft,
  AnticipoRoleConfig,
  RolAnticipo,
} from "../../dashboard/types";
import { fetchUsuarios } from "../../dashboard/utils";
import { ConfiguracionTab } from "../../dashboard/components/ConfiguracionTab";
import { saveAnticiposRolesConfig } from "../../lib/save-roles-config";

export function AnticiposSettingsView({
  empresa,
  onChanged,
}: {
  empresa: number | null;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<AnticiposConfigDraft>(emptyConfigDraft);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const roles = useConvexQuery(
    api.financiero.anticipos.obtenerRolesConfig,
    empresa !== null ? { empresa } : {}
  ) as AnticipoRoleConfig[] | undefined;
  const cleanAdvances = useMutation(api.financiero.anticipos.limpiarDatosAnticipos);
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: fetchUsuarios,
    staleTime: 5 * 60 * 1000,
  });
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => (a.nombre ?? a.id).localeCompare(b.nombre ?? b.id)),
    [users]
  );

  useEffect(() => {
    if (empresa === null) {
      setDraft({ ...emptyConfigDraft });
      return;
    }
    if (!roles) return;
    const getRole = (role: RolAnticipo) => roles.find((item) => item.rol === role);
    const accounting = getRole("CONTABILIDAD");
    setDraft({
      GERENCIA: getRole("GERENCIA")?.userId ?? "",
      TESORERO: getRole("TESORERO")?.userId ?? "",
      CONTABILIDAD:
        accounting?.usuarios?.map((user) => user.userId) ??
        (accounting?.userId ? [accounting.userId] : []),
    });
  }, [empresa, roles]);

  async function save() {
    if (empresa === null) {
      toast.error("Selecciona una empresa para guardar responsables.");
      return;
    }
    setSaving(true);
    try {
      await saveAnticiposRolesConfig({
        empresa,
        singleRoles: {
          GERENCIA: draft.GERENCIA
            ? {
                userId: draft.GERENCIA,
                nombre: usersById.get(draft.GERENCIA)?.nombre ?? draft.GERENCIA,
                email: usersById.get(draft.GERENCIA)?.email ?? "",
              }
            : undefined,
          TESORERO: draft.TESORERO
            ? {
                userId: draft.TESORERO,
                nombre: usersById.get(draft.TESORERO)?.nombre ?? draft.TESORERO,
                email: usersById.get(draft.TESORERO)?.email ?? "",
              }
            : undefined,
        },
        contabilidad: draft.CONTABILIDAD.map((userId) => {
          const user = usersById.get(userId);
          return {
            userId,
            nombre: user?.nombre ?? userId,
            email: user?.email ?? "",
          };
        }),
      });
      toast.success("Responsables actualizados");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function clean(confirmation: string) {
    if (confirmation !== "LIMPIAR_ANTICIPOS") {
      toast.error("La confirmación no coincide.");
      return;
    }
    setCleaning(true);
    try {
      const result = await cleanAdvances({ confirmacion: "LIMPIAR_ANTICIPOS" });
      toast.success(`Se eliminaron ${result.anticipos} anticipos y ${result.fases} fases.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron limpiar los anticipos.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <ConfiguracionTab
      empresaConfigId={empresa}
      empresaConfigNombre={empresa ? getEmpresaNombre(empresa) : ""}
      configDraft={draft}
      onConfigDraftChange={(role, value) =>
        setDraft((current) =>
          role === "CONTABILIDAD"
            ? {
                ...current,
                CONTABILIDAD: Array.isArray(value) ? value : value ? [value] : [],
              }
            : {
                ...current,
                [role]: Array.isArray(value) ? value[0] ?? "" : value,
              }
        )
      }
      usuariosOrdenados={sortedUsers}
      isLoadingUsuarios={usersLoading}
      onSaveConfig={save}
      isSavingConfig={saving}
      onCleanAnticipos={clean}
      isCleaningAnticipos={cleaning}
    />
  );
}
