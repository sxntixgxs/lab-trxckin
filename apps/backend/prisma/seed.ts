import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ALLOWED_RUTAS } from "../src/permisos-roles/rutas-catalogo";
import { applySslMode } from "../src/prisma/connection-string-ssl.utils";

async function seed() {
  const connectionString = applySslMode(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const admin = await prisma.rol.upsert({
    where: { slug: "admin" },
    update: { nombre: "Administrador", activo: true },
    create: { slug: "admin", nombre: "Administrador" },
  });

  const member = await prisma.rol.upsert({
    where: { slug: "member" },
    update: { nombre: "Miembro", activo: true },
    create: { slug: "member", nombre: "Miembro" },
  });

  const memberRoutes = ["dashboard", "perfil"] as const;

  for (const ruta of ALLOWED_RUTAS) {
    await prisma.permisoRol.upsert({
      where: { id_rol_ruta: { id_rol: admin.id, ruta } },
      update: { activo: true },
      create: { id_rol: admin.id, ruta },
    });
  }

  for (const ruta of memberRoutes) {
    await prisma.permisoRol.upsert({
      where: { id_rol_ruta: { id_rol: member.id, ruta } },
      update: { activo: true },
      create: { id_rol: member.id, ruta },
    });
  }

  const gestionFinanciera = await prisma.proceso.findFirst({
    where: {
      nombre: { contains: "Gestión Financiera", mode: "insensitive" },
    },
  });
  if (!gestionFinanciera) {
    const existingPlain = await prisma.proceso.findFirst({
      where: {
        nombre: { contains: "Gestion Financiera", mode: "insensitive" },
      },
    });
    if (!existingPlain) {
      await prisma.proceso.create({
        data: { nombre: "Gestión Financiera", activo: true },
      });
    }
  }

  console.log("Seeded roles admin/member, route permissions, and Gestión Financiera");
  await prisma.$disconnect();
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
