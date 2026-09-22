"use client";

import { useMemo, useState } from "react";
import { Edit, Mail, Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RolOption, UsuarioDirectory } from "./usuarios-types";

const COLORES_ROL = [
  "bg-red-100 text-red-800",
  "bg-orange-100 text-orange-800",
  "bg-yellow-100 text-yellow-800",
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
];

interface ModalListaUsuariosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarios: UsuarioDirectory[];
  roles: RolOption[];
  titulo: string;
  onSelectUsuario: (usuario: UsuarioDirectory) => void;
}

function getInitials(nombre: string): string {
  return (
    nombre
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

export default function ModalListaUsuarios({
  open,
  onOpenChange,
  usuarios,
  roles,
  titulo,
  onSelectUsuario,
}: ModalListaUsuariosProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const getRolInfo = (idRol: number) => {
    const index = roles.findIndex((rol) => rol.id === idRol);
    const rol = index >= 0 ? roles[index] : undefined;
    return {
      nombre: rol?.nombre ?? "Desconocido",
      color: COLORES_ROL[(index >= 0 ? index : 0) % COLORES_ROL.length],
    };
  };

  const filteredUsuarios = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return usuarios;
    }
    return usuarios.filter(
      (usuario) =>
        usuario.nombre.toLowerCase().includes(term) || usuario.email.toLowerCase().includes(term),
    );
  }, [usuarios, searchTerm]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearchTerm("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-10"
          />
        </div>
        <ScrollArea className="h-[420px] pr-2">
          {filteredUsuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <Users className="mb-2 h-8 w-8" />
              No hay usuarios en este grupo
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsuarios.map((usuario) => {
                const rolInfo = getRolInfo(usuario.id_rol);
                return (
                  <div
                    key={usuario.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <Avatar className="h-10 w-10 border border-slate-200">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-semibold text-white">
                        {getInitials(usuario.nombre)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{usuario.nombre}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                        <Mail className="h-3 w-3" />
                        {usuario.email}
                      </p>
                      <div className="mt-1 flex gap-1">
                        <Badge className={`${rolInfo.color} font-medium`}>{rolInfo.nombre}</Badge>
                        <Badge variant={usuario.activo ? "default" : "destructive"}>
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        onSelectUsuario(usuario);
                        onOpenChange(false);
                      }}
                      title="Editar"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
