"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getProducts(search?: string, activeOnly = true) {
  return prisma.product.findMany({
    where: {
      ...(activeOnly ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { account: { select: { code: true, name: true } } },
    orderBy: { code: "asc" },
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { account: true },
  });
}

export async function createProduct(data: {
  code: string;
  name: string;
  description?: string;
  unit?: string;
  accountId?: string;
}) {
  const existing = await prisma.product.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`รหัสสินค้า ${data.code} มีในระบบแล้ว`);

  const product = await prisma.product.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      unit: data.unit || null,
      accountId: data.accountId || null,
    },
  });
  revalidatePath("/products");
  return product;
}

export async function updateProduct(
  id: string,
  data: {
    code: string;
    name: string;
    description?: string;
    unit?: string;
    accountId?: string;
    isActive: boolean;
  }
) {
  const existing = await prisma.product.findFirst({
    where: { code: data.code, NOT: { id } },
  });
  if (existing) throw new Error(`รหัสสินค้า ${data.code} มีในระบบแล้ว`);

  const product = await prisma.product.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      unit: data.unit || null,
      accountId: data.accountId || null,
      isActive: data.isActive,
    },
  });
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return product;
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
}

export async function importProductsCSV(
  rows: {
    code: string;
    name: string;
    description?: string;
    unit?: string;
    accountCode?: string;
  }[]
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.code || !row.name) {
      errors.push(`แถว "${row.code || "?"}" : ต้องมีรหัสและชื่อสินค้า`);
      continue;
    }
    try {
      let accountId: string | null = null;
      if (row.accountCode) {
        const account = await prisma.chartOfAccount.findUnique({
          where: { code: row.accountCode },
        });
        if (!account) {
          errors.push(`รหัส ${row.code}: ไม่พบผังบัญชี "${row.accountCode}"`);
          continue;
        }
        accountId = account.id;
      }

      const existing = await prisma.product.findUnique({ where: { code: row.code } });
      if (existing) {
        await prisma.product.update({
          where: { code: row.code },
          data: {
            name: row.name,
            description: row.description || null,
            unit: row.unit || null,
            accountId,
          },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            code: row.code,
            name: row.name,
            description: row.description || null,
            unit: row.unit || null,
            accountId,
          },
        });
        created++;
      }
    } catch {
      errors.push(`รหัส ${row.code}: บันทึกไม่สำเร็จ`);
    }
  }

  revalidatePath("/products");
  return { created, updated, errors };
}
