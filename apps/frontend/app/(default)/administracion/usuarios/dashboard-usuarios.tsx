"use client";

import { useMemo } from "react";
import { ChevronRight, Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RolOption, UsuarioDirectory } from "./usuarios-types";

const COLORES_ROL_HEX = ["#ef4444", "#f97316", "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981"];

interface DashboardUsuariosProps {
  listaUsuarios: UsuarioDirectory[];
  roles: RolOption[];
  onRolClick: (rol: RolOption, usuarios: UsuarioDirectory[]) => void;
}

export default function DashboardUsuarios({
  listaUsuarios,
  roles,
  onRolClick,
}: DashboardUsuariosProps) {
  const items = useMemo(() => {
    return roles.map((rol, index) => ({
      rol,
      count: listaUsuarios.filter((usuario) => usuario.id_rol === rol.id).length,
      color: COLORES_ROL_HEX[index % COLORES_ROL_HEX.length],
    }));
  }, [listaUsuarios, roles]);

  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <Card className="overflow-hidden border-slate-200 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-slate-100">
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <div className="rounded-lg bg-indigo-100 p-2">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          Distribución por rol
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-500">
            <Users className="mb-2 h-8 w-8" />
            No hay roles activos
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.rol.id}
              type="button"
              onClick={() => onRolClick(item.rol, listaUsuarios.filter((usuario) => usuario.id_rol === item.rol.id))}
              className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{item.rol.nombre}</span>
                  <span className="text-sm font-semibold text-slate-700">{item.count}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 transition group-hover:opacity-100" />
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
