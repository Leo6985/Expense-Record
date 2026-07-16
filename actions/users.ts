"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";

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
  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
  return user;
}
