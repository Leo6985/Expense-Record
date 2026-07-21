"use server";

import { prisma } from "@/lib/prisma";
import { productsTable, ProductRecord } from "@/lib/sheets-tables";
import { revalidatePath } from "next/cache";

/**
 * Postgres remains authoritative (POItem.productId still holds a real FK to Product.id there),
 * so every write dual-writes into the Google Sheet as a synced mirror. If the Sheet side fails,
 * the Postgres write already succeeded — surface the sync failure instead of silently losing it,
 * but don't roll back the Postgres write.
 */
async function syncProductToSheet(product: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  accountId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: ProductRecord = { ...product };
  try {
    await productsTable.update(product.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await productsTable.create(record);
    } else {
      throw err;
    }
  }
}

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
  await syncProductToSheet(product);

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
  await syncProductToSheet(product);

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return product;
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
  await productsTable.delete(id);
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
  const toCreateInSheet: ProductRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<ProductRecord> }[] = [];

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
        const data = {
          name: row.name,
          description: row.description || null,
          unit: row.unit || null,
          accountId,
        };
        await prisma.product.update({ where: { code: row.code }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const product = await prisma.product.create({
          data: {
            code: row.code,
            name: row.name,
            description: row.description || null,
            unit: row.unit || null,
            accountId,
          },
        });
        created++;
        toCreateInSheet.push(product);
      }
    } catch {
      errors.push(`รหัส ${row.code}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await productsTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await productsTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/products");
  return { created, updated, errors };
}
