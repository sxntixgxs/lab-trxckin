"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Briefcase,
  RefreshCw,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { esProcesoGestionFinanciera } from "../../billing/hooks/use-facturacion-users";
import { DashboardHero } from "@/components/dashboard-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import DashboardUsuarios from "./dashboard-usuarios";
import ModalEditarUsuario from "./modal-editar-usuario";
import ModalListaUsuarios from "./modal-lista-usuarios";
import CrearUsuarioPanel from "./crear-usuario-panel";
import ProcesosPanel from "./procesos-panel";
import TablaUsuarios from "./tabla-usuarios";
import type { ProcesoOption, RolOption, UsuarioDirectory } from "./usuarios-types";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  isAdminUser,
  reloadAfterSessionChange,
  startImpersonation,
} from "@/lib/impersonate-client";

interface UsuariosClientContentProps {
  listaUsuarios: UsuarioDirectory[];
  roles: RolOption[];
  procesos: ProcesoOption[];
  currentUserId: string;
}

export default function UsuariosClientContent({
  listaUsuarios,
  roles,
  procesos,
  currentUserId,
}: UsuariosClientContentProps) {
  const router = useRouter();
  const { backendUser } = useCurrentUser();
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState(listaUsuarios);
  const [procesosState, setProcesosState] = useState(procesos);
  const [refreshing, setRefreshing] = useState(false);
  const [modalLista, setModalLista] = useState(false);
  const [usuariosFiltrados, setUsuariosFiltrados] = useState<UsuarioDirectory[]>([]);
  const [tituloModal, setTituloModal] = useState("");
  const [modalEditar, setModalEditar] = useState(false);
  const [usuarioEditable, setUsuarioEditable] = useState<UsuarioDirectory | null>(null);

  useEffect(() => {
    setUsuarios(listaUsuarios);
  }, [listaUsuarios]);

  useEffect(() => {
    setProcesosState(procesos);
  }, [procesos]);

  const reloadDirectory = async () => {
    const [usuariosResponse, procesosResponse] = await Promise.all([
      fetch("/api/usuarios", { cache: "no-store" }),
      fetch("/api/procesos", { cache: "no-store" }),
    ]);
    if (usuariosResponse.ok) {
      setUsuarios((await usuariosResponse.json()) as UsuarioDirectory[]);
    }
    if (procesosResponse.ok) {
      setProcesosState((await procesosResponse.json()) as ProcesoOption[]);
    }
    router.refresh();
  };

  const totalUsuarios = usuarios.length;
  const usuariosActivos = usuarios.filter((usuario) => usuario.activo).length;
  const usuariosInactivos = totalUsuarios - usuariosActivos;
  const admins = usuarios.filter((usuario) => usuario.rol.slug === "admin").length;
  const lideres = usuarios.filter((usuario) => usuario.activo && usuario.lider_proceso).length;
  const finanzas = usuarios.filter(
    (usuario) => usuario.activo && esProcesoGestionFinanciera(usuario.proceso?.nombre),
  ).length;

  const abrirModalConUsuarios = (usuarios: UsuarioDirectory[], titulo: string) => {
    setUsuariosFiltrados(usuarios);
    setTituloModal(titulo);
    setModalLista(true);
  };

  const handleSelectUsuario = (usuario: UsuarioDirectory) => {
    setUsuarioEditable(usuario);
    setModalEditar(true);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void reloadDirectory().finally(() => setRefreshing(false));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4 md:p-10">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <DashboardHero
          title="Usuarios"
          description="Asigna rol, cargo, proceso y empresas. Gestión Financiera + líder es lo que Billing Settings e Inbox esperan."
          icon={<Users className="h-10 w-10 text-white" />}
          className="mb-6"
          actions={
            <Button
              type="button"
              variant="secondary"
              onClick={handleRefresh}
              className="rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Total"
            value={totalUsuarios}
            icon={<Users className="h-4 w-4 text-blue-600" />}
            tone="blue"
            onClick={() => abrirModalConUsuarios(usuarios, "Todos los Usuarios")}
          />
          <MetricCard
            label="Activos"
            value={usuariosActivos}
            icon={<Activity className="h-4 w-4 text-green-600" />}
            tone="green"
            onClick={() =>
              abrirModalConUsuarios(
                usuarios.filter((usuario) => usuario.activo),
                "Usuarios Activos",
              )
            }
          />
          <MetricCard
            label="Inactivos"
            value={usuariosInactivos}
            icon={<AlertCircle className="h-4 w-4 text-red-600" />}
            tone="red"
            onClick={() =>
              abrirModalConUsuarios(
                usuarios.filter((usuario) => !usuario.activo),
                "Usuarios Inactivos",
              )
            }
          />
          <MetricCard
            label="Admin"
            value={admins}
            icon={<Shield className="h-4 w-4 text-purple-600" />}
            tone="purple"
            onClick={() =>
              abrirModalConUsuarios(
                usuarios.filter((usuario) => usuario.rol.slug === "admin"),
                "Administradores",
              )
            }
          />
          <MetricCard
            label="Líderes"
            value={lideres}
            icon={<UserRound className="h-4 w-4 text-cyan-600" />}
            tone="cyan"
            onClick={() =>
              abrirModalConUsuarios(
                usuarios.filter((usuario) => usuario.activo && usuario.lider_proceso),
                "Líderes de proceso",
              )
            }
          />
          <MetricCard
            label="Finanzas"
            value={finanzas}
            icon={<Briefcase className="h-4 w-4 text-amber-600" />}
            tone="amber"
            onClick={() =>
              abrirModalConUsuarios(
                usuarios.filter(
                  (usuario) =>
                    usuario.activo && esProcesoGestionFinanciera(usuario.proceso?.nombre),
                ),
                "Gestión Financiera",
              )
            }
          />
        </div>

        <Separator />

        <DashboardUsuarios
          listaUsuarios={usuarios}
          roles={roles}
          onRolClick={(rol, usuarios) => abrirModalConUsuarios(usuarios, `Usuarios - ${rol.nombre}`)}
        />

        <Separator />

        <ProcesosPanel
          procesos={procesosState}
          usuarios={usuarios}
          onChanged={() => void reloadDirectory()}
        />

        <CrearUsuarioPanel
          roles={roles}
          procesos={procesosState}
          usuarios={usuarios}
          onCreated={() => void reloadDirectory()}
        />

        <TablaUsuarios
          usuarios={usuarios}
          roles={roles}
          procesos={procesosState}
          currentUserId={currentUserId}
          canImpersonate={isAdminUser(backendUser)}
          impersonatingId={impersonatingId}
          onEdit={handleSelectUsuario}
          onChanged={() => void reloadDirectory()}
          onImpersonate={async (usuario) => {
            setImpersonatingId(usuario.id);
            const result = await startImpersonation(usuario.id);
            if (!result.ok) {
              setImpersonatingId(null);
              toast.error(result.message);
              return;
            }
            reloadAfterSessionChange(`Ahora estás actuando como ${result.nombre}`);
          }}
        />

        <ModalListaUsuarios
          open={modalLista}
          onOpenChange={setModalLista}
          usuarios={usuariosFiltrados}
          roles={roles}
          titulo={tituloModal}
          onSelectUsuario={handleSelectUsuario}
        />

        <ModalEditarUsuario
          open={modalEditar}
          onOpenChange={setModalEditar}
          usuario={usuarioEditable}
          roles={roles}
          procesos={procesosState}
          usuarios={usuarios}
          currentUserId={currentUserId}
          onSaved={() => void reloadDirectory()}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "blue" | "green" | "red" | "purple" | "cyan" | "amber";
  onClick: () => void;
}) {
  const tones = {
    blue: "from-blue-50 to-white",
    green: "from-green-50 to-white",
    red: "from-red-50 to-white",
    purple: "from-purple-50 to-white",
    cyan: "from-cyan-50 to-white",
    amber: "from-amber-50 to-white",
  };
  const iconTones = {
    blue: "bg-blue-100 group-hover:bg-blue-200",
    green: "bg-green-100 group-hover:bg-green-200",
    red: "bg-red-100 group-hover:bg-red-200",
    purple: "bg-purple-100 group-hover:bg-purple-200",
    cyan: "bg-cyan-100 group-hover:bg-cyan-200",
    amber: "bg-amber-100 group-hover:bg-amber-200",
  };
  const valueTones = {
    blue: "text-blue-600",
    green: "text-green-600",
    red: "text-red-600",
    purple: "text-purple-600",
    cyan: "text-cyan-600",
    amber: "text-amber-600",
  };

  return (
    <Card
      onClick={onClick}
      className={`group cursor-pointer bg-gradient-to-br ${tones[tone]} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`rounded-lg p-2 transition-colors ${iconTones[tone]}`}>{icon}</div>
            <div>
              <p className="text-sm font-medium text-slate-600">{label}</p>
              <p className={`text-2xl font-bold ${valueTones[tone]}`}>{value}</p>
            </div>
          </div>
          <ArrowRight className={`h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 ${valueTones[tone]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function LoadingUsuarios() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4 md:p-10">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-300/70" />
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="h-12 animate-pulse rounded-lg bg-slate-200" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="h-48 animate-pulse rounded-lg bg-slate-200" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
