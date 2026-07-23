"use server";

import { prisma } from "@/lib/prisma";
import { vendorsTable, VendorRecord } from "@/lib/sheets-tables";
import { revalidatePath } from "next/cache";

/**
 * Postgres remains authoritative (PurchaseOrder/AccountsPayable still hold a real FK to
 * Vendor.id there), so every write dual-writes into the Google Sheet as a synced mirror.
 * If the Sheet side fails, the Postgres write already succeeded — surface the sync failure
 * instead of silently losing it, but don't roll back the Postgres write.
 */
async function syncVendorToSheet(vendor: {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: VendorRecord = { ...vendor };
  try {
    await vendorsTable.update(vendor.id, record);
  } catch (err) {
    // row doesn't exist in the sheet yet (e.g. created before the sheet mirror existed) — self-heal.
    // Any other error (network, quota, auth) must propagate instead of risking a duplicate row.
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await vendorsTable.create(record);
    } else {
      throw err;
    }
  }
}

export async function getVendors(search?: string) {
  return prisma.vendor.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { taxId: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getVendor(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}

export async function createVendor(data: {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  creditDays?: number;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
}) {
  const existing = await prisma.vendor.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`รหัสผู้ขาย ${data.code} มีในระบบแล้ว`);

  const vendor = await prisma.vendor.create({ data });
  try {
    await syncVendorToSheet(vendor);
  } catch (err) {
    // Postgres write already succeeded — don't fail vendor creation over a Sheet sync hiccup
    // (mirrors the tolerance importVendorsCSV already has for the same failure class).
    console.error("syncVendorToSheet failed after createVendor:", err);
  }

  revalidatePath("/vendors");
  return vendor;
}

export async function updateVendor(
  id: string,
  data: {
    code?: string;
    name?: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    isActive?: boolean;
  }
) {
  if (data.code) {
    const existing = await prisma.vendor.findFirst({ where: { code: data.code, NOT: { id } } });
    if (existing) throw new Error(`รหัสผู้ขาย ${data.code} มีในระบบแล้ว`);
  }

  const vendor = await prisma.vendor.update({ where: { id }, data });
  try {
    await syncVendorToSheet(vendor);
  } catch (err) {
    console.error("syncVendorToSheet failed after updateVendor:", err);
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return vendor;
}

export async function deleteVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true, accountsPayable: true } } },
  });
  if (!vendor) return;

  if (vendor._count.purchaseOrders > 0 || vendor._count.accountsPayable > 0) {
    throw new Error(
      `ไม่สามารถลบผู้ขาย "${vendor.name}" ได้ เนื่องจากมีใบสั่งซื้อหรือใบตั้งหนี้ผูกอยู่ กรุณาปิดใช้งานแทน`
    );
  }

  await prisma.vendor.delete({ where: { id } });
  await vendorsTable.delete(id);

  revalidatePath("/vendors");
}

/**
 * For "full sync" import preview: vendors currently in the system whose code is absent
 * from the uploaded file, split by whether deleting them is actually safe (no linked
 * PO/AP records) — mirrors the guard in deleteVendor.
 */
export async function previewFullSyncDeletions(codesInFile: string[]) {
  const codeSet = new Set(codesInFile.filter(Boolean));
  if (codeSet.size === 0) return { deletable: [], blocked: [] };

  const candidates = await prisma.vendor.findMany({
    where: { code: { notIn: Array.from(codeSet) } },
    include: { _count: { select: { purchaseOrders: true, accountsPayable: true } } },
  });

  const deletable = candidates
    .filter((v) => v._count.purchaseOrders === 0 && v._count.accountsPayable === 0)
    .map((v) => ({ id: v.id, code: v.code, name: v.name }));
  const blocked = candidates
    .filter((v) => v._count.purchaseOrders > 0 || v._count.accountsPayable > 0)
    .map((v) => ({ id: v.id, code: v.code, name: v.name }));

  return { deletable, blocked };
}

export async function importVendorsCSV(
  rows: {
    code: string;
    name: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
  }[],
  options?: { fullSync?: boolean }
) {
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];
  const toCreateInSheet: VendorRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<VendorRecord> }[] = [];

  for (const row of rows) {
    if (!row.code || !row.name) {
      errors.push(`แถว "${row.code || "?"}" : ต้องมีรหัสและชื่อผู้ขาย`);
      continue;
    }
    try {
      const existing = await prisma.vendor.findUnique({ where: { code: row.code } });
      if (existing) {
        const data = {
          name: row.name,
          taxId: row.taxId || null,
          address: row.address || null,
          contactPerson: row.contactPerson || null,
          phone: row.phone || null,
          email: row.email || null,
          creditDays: row.creditDays ?? existing.creditDays,
          bankName: row.bankName || null,
          bankBranch: row.bankBranch || null,
          bankAccountNo: row.bankAccountNo || null,
          bankAccountName: row.bankAccountName || null,
        };
        await prisma.vendor.update({ where: { code: row.code }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const vendor = await prisma.vendor.create({
          data: {
            code: row.code,
            name: row.name,
            taxId: row.taxId || null,
            address: row.address || null,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            creditDays: row.creditDays ?? 30,
            bankName: row.bankName || null,
            bankBranch: row.bankBranch || null,
            bankAccountNo: row.bankAccountNo || null,
            bankAccountName: row.bankAccountName || null,
          },
        });
        created++;
        toCreateInSheet.push(vendor);
      }
    } catch {
      errors.push(`รหัส ${row.code}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await vendorsTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await vendorsTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (options?.fullSync) {
    const { deletable, blocked } = await previewFullSyncDeletions(rows.map((r) => r.code));

    if (deletable.length > 0) {
      const deletableIds = deletable.map((v) => v.id);
      await prisma.vendor.deleteMany({ where: { id: { in: deletableIds } } });
      deleted = deletable.length;
      try {
        await vendorsTable.deleteWhere((r) => deletableIds.includes(r.id));
      } catch (err) {
        errors.push(
          `ลบผู้ขาย ${deleted} รายการในระบบหลักแล้ว แต่ลบใน Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    for (const v of blocked) {
      errors.push(
        `ไม่สามารถลบผู้ขาย "${v.name}" (${v.code}) ได้ เนื่องจากมีใบสั่งซื้อหรือใบตั้งหนี้ผูกอยู่ กรุณาปิดใช้งานแทน`
      );
    }
  }

  revalidatePath("/vendors");
  return { created, updated, deleted, errors };
}

export async function getNextVendorCode() {
  const lastVendor = await prisma.vendor.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  if (!lastVendor) return "V00001";
  const num = parseInt(lastVendor.code.replace("V", "")) + 1;
  return `V${String(num).padStart(5, "0")}`;
}
