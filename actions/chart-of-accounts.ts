"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getChartOfAccounts(search?: string) {
  return prisma.chartOfAccount.findMany({
    where: search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { code: "asc" },
  });
}

export async function getChartOfAccount(id: string) {
  return prisma.chartOfAccount.findUnique({
    where: { id },
    include: { products: { select: { id: true, code: true, name: true } } },
  });
}

export async function createChartOfAccount(data: {
  code: string;
  name: string;
  type: string;
}) {
  const existing = await prisma.chartOfAccount.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`รหัสบัญชี ${data.code} มีในระบบแล้ว`);

  const account = await prisma.chartOfAccount.create({ data });
  revalidatePath("/chart-of-accounts");
  return account;
}

export async function updateChartOfAccount(
  id: string,
  data: { code: string; name: string; type: string; isActive: boolean }
) {
  const existing = await prisma.chartOfAccount.findFirst({
    where: { code: data.code, NOT: { id } },
  });
  if (existing) throw new Error(`รหัสบัญชี ${data.code} มีในระบบแล้ว`);

  const account = await prisma.chartOfAccount.update({ where: { id }, data });
  revalidatePath("/chart-of-accounts");
  revalidatePath(`/chart-of-accounts/${id}`);
  return account;
}

export async function deleteChartOfAccount(id: string) {
  const hasProducts = await prisma.product.count({ where: { accountId: id } });
  if (hasProducts > 0) throw new Error("ไม่สามารถลบได้ เนื่องจากมีสินค้าที่ใช้ผังบัญชีนี้อยู่");
  await prisma.chartOfAccount.delete({ where: { id } });
  revalidatePath("/chart-of-accounts");
}
