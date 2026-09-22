import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { applySslMode } from "../src/prisma/connection-string-ssl.utils";

type WorkosUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

function readEmailArg(): string {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: pnpm promote-admin <email>");
    process.exit(1);
  }
  return email;
}

async function fetchWorkosUser(email: string): Promise<WorkosUser> {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("WORKOS_API_KEY is not set");
  }

  const url = new URL("https://api.workos.com/user_management/users");
  url.searchParams.set("email", email);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`WorkOS user lookup failed: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: WorkosUser[] };
  // Exact (case-insensitive) match only — never promote an arbitrary first row.
  const user = payload.data?.find((row) => row.email?.trim().toLowerCase() === email);
  if (!user?.id) {
    throw new Error(`No WorkOS user found for ${email}`);
  }
  return user;
}

async function main() {
  const email = readEmailArg();
  const workosUser = await fetchWorkosUser(email);
  const workosEmail = workosUser.email.trim().toLowerCase();
  const nombre =
    [workosUser.first_name, workosUser.last_name].filter(Boolean).join(" ").trim() || workosEmail;

  const connectionString = applySslMode(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const admin = await prisma.rol.findUnique({ where: { slug: "admin" } });
    if (!admin) {
      throw new Error("admin role is missing; run seed first");
    }

    const existing = await prisma.usuario.findFirst({
      where: { OR: [{ workosUserId: workosUser.id }, { email: workosEmail }] },
    });

    const usuario = existing
      ? await prisma.usuario.update({
          where: { id: existing.id },
          data: {
            workosUserId: workosUser.id,
            email: workosEmail,
            nombre,
            id_rol: admin.id,
            activo: true,
          },
          include: { rol: true },
        })
      : await prisma.usuario.create({
          data: {
            workosUserId: workosUser.id,
            email: workosEmail,
            nombre,
            id_rol: admin.id,
          },
          include: { rol: true },
        });

    const permisos = await prisma.permisoRol.findMany({
      where: { id_rol: usuario.id_rol, activo: true },
      select: { ruta: true },
    });

    console.log(
      JSON.stringify(
        {
          email: usuario.email,
          workosUserId: usuario.workosUserId,
          role: usuario.rol.slug,
          permisos: permisos.map((row) => row.ruta),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
