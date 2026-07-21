"use server";

import { prisma } from "@/lib/prisma";
import { chartOfAccountsTable, ChartOfAccountRecord } from "@/lib/sheets-tables";
import { revalidatePath } from "next/cache";

/**
 * Postgres remains authoritative (Product.accountId still holds a real FK to
 * ChartOfAccount.id there), so every write dual-writes into the Google Sheet as a synced mirror.
 * If the Sheet side fails, the Postgres write already succeeded — surface the sync failure
 * instead of silently losing it, but don't roll back the Postgres write.
 */
async function syncAccountToSheet(account: {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: ChartOfAccountRecord = { ...account };
  try {
    await chartOfAccountsTable.update(account.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await chartOfAccountsTable.create(record);
    } else {
      throw err;
    }
  }
}

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
  await syncAccountToSheet(account);

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
  await syncAccountToSheet(account);

  revalidatePath("/chart-of-accounts");
  revalidatePath(`/chart-of-accounts/${id}`);
  return account;
}

export async function deleteChartOfAccount(id: string) {
  const hasProducts = await prisma.product.count({ where: { accountId: id } });
  if (hasProducts > 0) throw new Error("ไม่สามารถลบได้ เนื่องจากมีสินค้าที่ใช้ผังบัญชีนี้อยู่");
  await prisma.chartOfAccount.delete({ where: { id } });
  await chartOfAccountsTable.delete(id);
  revalidatePath("/chart-of-accounts");
}

export async function importChartOfAccountsCSV(
  rows: { code: string; name: string; type?: string }[]
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const toCreateInSheet: ChartOfAccountRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<ChartOfAccountRecord> }[] = [];

  for (const row of rows) {
    if (!row.code || !row.name) {
      errors.push(`แถว "${row.code || "?"}" : ต้องมีรหัสและชื่อบัญชี`);
      continue;
    }
    try {
      const existing = await prisma.chartOfAccount.findUnique({ where: { code: row.code } });
      if (existing) {
        const data = { name: row.name, type: row.type || existing.type };
        await prisma.chartOfAccount.update({ where: { code: row.code }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const account = await prisma.chartOfAccount.create({
          data: { code: row.code, name: row.name, type: row.type || "EXPENSE" },
        });
        created++;
        toCreateInSheet.push(account);
      }
    } catch {
      errors.push(`รหัส ${row.code}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await chartOfAccountsTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await chartOfAccountsTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/chart-of-accounts");
  return { created, updated, errors };
}
