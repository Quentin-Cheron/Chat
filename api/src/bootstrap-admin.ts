import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { auth } from "./auth";

async function bootstrapAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const databaseUrl = process.env.DATABASE_URL;

  if (!adminEmail || !adminPassword || !databaseUrl) {
    console.log("[api] admin bootstrap skipped (missing ADMIN_EMAIL/ADMIN_PASSWORD/DATABASE_URL)");
    return;
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
  });
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();
  try {
    const existing = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });

    if (existing) {
      console.log(`[api] admin already exists (${adminEmail})`);
      return;
    }

    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: "Administrator",
      },
      headers: new Headers(),
    });

    const created = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });

    if (!created) {
      console.warn(`[api] admin bootstrap failed: user not found after creation (${adminEmail})`);
      return;
    }

    await prisma.userSecurity.upsert({
      where: { userId: created.id },
      update: { mustChangePassword: true },
      create: {
        userId: created.id,
        mustChangePassword: true,
      },
    });

    console.log(`[api] admin account created (${adminEmail}) and flagged for password rotation`);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrapAdmin().catch((error) => {
  console.error("[api] admin bootstrap error:", error);
  process.exitCode = 1;
});
