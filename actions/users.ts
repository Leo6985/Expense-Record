"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { usersTable, UserRecord } from "@/lib/sheets-tables";

/**
 * Postgres remains authoritative and is the only place the password hash ever lives.
 * The Sheet mirror deliberately excludes it (see UserRecord) — every write dual-writes
 * the non-sensitive profile fields only. If the Sheet side fails, the Postgres write
 * already succeeded — surface the sync failure instead of silently losing it, but don't
 * roll back the Postgres write.
 */
async function syncUserToSheet(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  level: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: UserRecord = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    level: user.level,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  try {
    await usersTable.update(user.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await usersTable.create(record);
    } else {
      throw err;
    }
  }
}

export async function getUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: string;
  level: string;
}) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") throw new Error("ไม่มีสิทธิ์");

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { ...data, password: hashed },
  });
  await syncUserToSheet(user);
  revalidatePath("/users");
  return user;
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    email?: string;
    role?: string;
    level?: string;
    isActive?: boolean;
    password?: string;
  }
) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") throw new Error("ไม่มีสิทธิ์");

  const { password, ...rest } = data;
  const updateData: typeof rest & { password?: string } = { ...rest };
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({ where: { id }, data: updateData });
  await syncUserToSheet(user);
  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  return user;
}
