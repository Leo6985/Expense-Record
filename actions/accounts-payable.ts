"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { accountsPayableTable, AccountsPayableRecord } from "@/lib/sheets-tables";
import { findOrCreateVendorByName } from "./vendors";
import { parseImportDate } from "@/lib/import-dates";
import { computeDueDate } from "@/lib/invoice-due-dates";

const AMOUNT_TOLERANCE = 0.01;

// รหัสผังบัญชีเริ่มต้นสำหรับ AP ที่นำเข้าจากไฟล์ "สินค้า/บริการที่ซื้อมาเพื่อขาย" เมื่อไฟล์ไม่ได้ระบุ
// หมวดบัญชีมาเอง — ผูกกับ "สินค้าสำเร็จรูปคงเหลือ" ตามที่ตกลงกับผู้ใช้ระบบนี้
const DEFAULT_RESALE_GOODS_ACCOUNT_CODE = "1140-20";

/**
 * Postgres remains authoritative (POItem/GoodsReceiptItem/PaymentPrepItem-adjacent tables
 * still hold real FKs into this table's id via PO/GR/PaymentPrep), so every write dual-writes
 * into the Google Sheet as a synced mirror. If the Sheet side fails, the Postgres write already
 * succeeded — surface the sync failure instead of silently losing it, but don't roll back the
 * Postgres write.
 */
export async function syncAPToSheet(ap: {
  id: string;
  apNumber: string;
  vendorId: string;
  poId: string | null;
  grId: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  accountId: string | null;
  poNumberRef: string | null;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: AccountsPayableRecord = { ...ap };
  try {
    await accountsPayableTable.update(ap.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await accountsPayableTable.create(record);
    } else {
      throw err;
    }
  }
}

/** Re-fetches each AP by id from Postgres and syncs its current state to the Sheet.
 * Use after a transaction that may have changed AP status via syncAPStatus() below.
 * Fetches all APs in one query (not N parallel connections — Prisma's default pool size,
 * e.g. 3 on a 1-vCPU serverless function, was being exhausted once a prep/payment covered
 * more APs than the pool, surfacing as a generic Server Components render error), then
 * syncs each to the Sheet in parallel — that part only hits the Sheets API, not Postgres. */
export async function syncAPsToSheetById(apIds: string[]) {
  const uniqueIds = Array.from(new Set(apIds));
  if (uniqueIds.length === 0) return;
  const aps = await prisma.accountsPayable.findMany({ where: { id: { in: uniqueIds } } });
  await Promise.all(aps.map((ap) => syncAPToSheet(ap)));
}

// Sums how much of an AP's totalAmount has been committed to non-cancelled payment
// preps, and reconciles ap.status against it. Called after any prep create/edit/
// cancel/payment so partially-prepped APs stay selectable for the remaining balance.
export async function syncAPStatus(tx: Prisma.TransactionClient, apId: string) {
  const ap = await tx.accountsPayable.findUniqueOrThrow({
    where: { id: apId },
    include: { paymentPrepItems: { include: { prep: true } } },
  });
  if (ap.status === "CANCELLED") return;

  const activeItems = ap.paymentPrepItems.filter((item) => item.prep.status !== "CANCELLED");
  const consumed = activeItems.reduce((s, item) => s + item.amount, 0);
  const remaining = ap.totalAmount - consumed;
  const allSettled = activeItems.length > 0 && activeItems.every((item) => item.prep.status === "PAID");

  let newStatus = ap.status;
  if (remaining <= AMOUNT_TOLERANCE && allSettled) newStatus = "PAID";
  else if (remaining <= AMOUNT_TOLERANCE) newStatus = "PAYMENT_PREP";
  else newStatus = "APPROVED";

  if (newStatus !== ap.status) {
    await tx.accountsPayable.update({ where: { id: apId }, data: { status: newStatus } });
  }
}

export async function getAccountsPayable(search?: string, status?: string) {
  return prisma.accountsPayable.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { apNumber: { contains: search, mode: "insensitive" } },
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { vendor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: {
      vendor: { select: { name: true } },
      po: { select: { poNumber: true } },
      gr: { select: { grNumber: true } },
      account: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAdjacentAccountsPayableIds(id: string) {
  const rows = await prisma.accountsPayable.findMany({
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? rows[idx - 1].id : null,
    nextId: idx < rows.length - 1 ? rows[idx + 1].id : null,
  };
}

export async function getAccountsPayableById(id: string) {
  return prisma.accountsPayable.findUnique({
    where: { id },
    include: {
      vendor: true,
      po: { include: { items: true } },
      gr: true,
      account: true,
    },
  });
}

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides with an existing number once any row in the middle of the sequence
// has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextAPNumber() {
  const year = String(new Date().getFullYear());
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `AP${year}${month}`;
  const last = await prisma.accountsPayable.findFirst({
    where: { apNumber: { startsWith: prefix } },
    orderBy: { apNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.apNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export async function createAccountsPayable(data: {
  vendorId: string;
  poId?: string;
  grId?: string;
  accountId?: string;
  // เลขที่ PO อ้างอิงแบบพิมพ์เอง (ไม่ใช่ FK) — ใช้เมื่อยังไม่มีการออก PO จริงในระบบ (poId ด้านบน)
  poNumberRef?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  vatAmount?: number;
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const apNumber = await getNextAPNumber();
  const vatAmount = data.vatAmount ?? 0;
  const totalAmount = data.amount + vatAmount;

  const ap = await prisma.accountsPayable.create({
    data: {
      apNumber,
      vendorId: data.vendorId,
      poId: data.poId || null,
      grId: data.grId || null,
      accountId: data.accountId || null,
      poNumberRef: data.poNumberRef || null,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: new Date(data.dueDate),
      amount: data.amount,
      vatAmount,
      totalAmount,
      notes: data.notes,
      createdByName,
      createdById,
    },
  });
  await syncAPToSheet(ap);

  revalidatePath("/accounts-payable");
  return ap;
}

export async function approveAccountsPayable(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const ap = await prisma.accountsPayable.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "" },
  });
  await syncAPToSheet(ap);

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

export async function unapproveAccountsPayable(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const ap = await prisma.accountsPayable.findUnique({
    where: { id },
    include: { paymentPrepItems: { include: { prep: true } } },
  });
  if (!ap) throw new Error("ไม่พบรายการหนี้");
  if (ap.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะรายการที่อนุมัติแล้วเท่านั้น");
  const hasActivePrep = ap.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED");
  if (hasActivePrep) throw new Error("ไม่สามารถยกเลิกอนุมัติได้ เนื่องจากถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว");

  const updated = await prisma.accountsPayable.update({
    where: { id },
    data: { status: "PENDING", approvedByName: null, approvedById: null },
  });
  await syncAPToSheet(updated);

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

export async function cancelAccountsPayable(id: string) {
  const ap = await prisma.accountsPayable.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await syncAPToSheet(ap);

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

// Hard-deletes an AP — unlike cancelAccountsPayable (which keeps the record as an audit trail
// with status CANCELLED), this removes it entirely. Only allowed while still PENDING (mirrors
// deleteReceipt's "DRAFT-only" rule) — once approved, unapprove it back to PENDING first, or
// use cancel to keep the audit trail instead. Also blocked if any PaymentPrepItem references
// this AP at all (even from a cancelled prep), since that FK has no onDelete: Cascade and
// Postgres would otherwise reject the delete.
export async function deleteAccountsPayable(id: string) {
  const ap = await prisma.accountsPayable.findUnique({
    where: { id },
    include: { _count: { select: { paymentPrepItems: true } } },
  });
  if (!ap) return;

  if (ap.status !== "PENDING") {
    throw new Error("ลบได้เฉพาะรายการที่ยังไม่อนุมัติเท่านั้น กรุณายกเลิกอนุมัติก่อน หรือใช้ปุ่มยกเลิกแทน");
  }
  if (ap._count.paymentPrepItems > 0) {
    throw new Error(
      `ไม่สามารถลบใบตั้งหนี้ "${ap.apNumber}" ได้ เนื่องจากมีการดึงไปใช้ในใบเตรียมจ่ายแล้ว กรุณายกเลิกรายการนั้นก่อน`
    );
  }

  await prisma.accountsPayable.delete({ where: { id } });
  try {
    await accountsPayableTable.delete(id);
  } catch (err) {
    console.error("Sheet cleanup failed after deleteAccountsPayable:", err);
  }

  revalidatePath("/accounts-payable");
}

// Lists APs still open for a payment prep, with each one's unclaimed balance.
// When editing an existing DRAFT prep, pass its id as `excludePrepId` so that
// prep's own items don't count against the AP's remaining balance.
export async function getAvailableAPForPayment(excludePrepId?: string) {
  // Editing a prep may need to show an AP that this same prep already locked into
  // PAYMENT_PREP status by consuming its whole remaining balance.
  const statuses = excludePrepId ? ["PENDING", "APPROVED", "PAYMENT_PREP"] : ["PENDING", "APPROVED"];
  const aps = await prisma.accountsPayable.findMany({
    where: { status: { in: statuses } },
    include: {
      vendor: { select: { name: true, bankAccountNo: true, bankAccountName: true } },
      paymentPrepItems: { include: { prep: { select: { status: true } } } },
    },
    orderBy: { dueDate: "asc" },
  });

  return aps
    .map((ap) => {
      const consumed = ap.paymentPrepItems
        .filter((item) => item.prep.status !== "CANCELLED" && item.prepId !== excludePrepId)
        .reduce((s, item) => s + item.amount, 0);
      const remainingAmount = Math.max(0, Math.round((ap.totalAmount - consumed) * 100) / 100);
      return { ...ap, remainingAmount };
    })
    .filter((ap) => ap.remainingAmount > AMOUNT_TOLERANCE);
}

export async function getReceivedPOsWithoutAP() {
  return prisma.purchaseOrder.findMany({
    where: {
      status: "RECEIVED",
      accountsPayable: {
        none: {
          status: { notIn: ["CANCELLED"] },
        },
      },
    },
    include: {
      vendor: true,
      items: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

type ImportRow = {
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  amount?: number;
  vatAmount?: number;
  totalAmount?: number;
  accountCode?: string;
  poNumber?: string;
  notes?: string;
};

/**
 * Bulk-imports "สินค้าและบริการที่ซื้อมาเพื่อขาย" (goods/services purchased for resale) as
 * AccountsPayable rows — mirrors importSalesInvoicesCSV on the AR side: no PO/GR required
 * (poId/grId are already optional on this model), vendor auto-created by name if not found,
 * and the created AP flows into the existing PaymentPrep → Payment reconciliation exactly
 * like any other AP. Each row is tagged with accountId (defaulting to "สินค้าสำเร็จรูปคงเหลือ",
 * DEFAULT_RESALE_GOODS_ACCOUNT_CODE) so getProfitLossReport can categorize it correctly even
 * though it has no PO/GR/Product chain to derive a category from. poNumber is stored as-is into
 * AccountsPayable.poNumberRef — a free-text reference, not a lookup against PurchaseOrder — so
 * these purchases don't require a PO to already exist in the system (per user decision: this
 * whole import path is explicitly for goods/services bought without going through the PO flow).
 */
export async function importAccountsPayableCSV(rows: ImportRow[]) {
  let created = 0;
  let updated = 0;
  let vendorsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const toCreateInSheet: AccountsPayableRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<AccountsPayableRecord> }[] = [];

  const defaultAccount = await prisma.chartOfAccount.findUnique({
    where: { code: DEFAULT_RESALE_GOODS_ACCOUNT_CODE },
  });

  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  for (const row of rows) {
    if (!row.invoiceNumber || !row.invoiceDate || !row.vendorName) {
      errors.push(`แถว "${row.invoiceNumber || "?"}" : ต้องมีเลขที่ใบแจ้งหนี้ วันที่ และชื่อผู้ขาย`);
      continue;
    }
    const invoiceDate = parseImportDate(row.invoiceDate);
    if (!invoiceDate) {
      errors.push(`เลขที่ใบแจ้งหนี้ ${row.invoiceNumber}: วันที่ไม่ถูกต้อง ("${row.invoiceDate}")`);
      continue;
    }
    const vatAmount = row.vatAmount ?? 0;
    const amount = row.amount ?? (row.totalAmount !== undefined ? row.totalAmount - vatAmount : undefined);
    const totalAmount = row.totalAmount ?? (amount !== undefined ? amount + vatAmount : undefined);
    if (amount === undefined || totalAmount === undefined) {
      errors.push(`เลขที่ใบแจ้งหนี้ ${row.invoiceNumber}: ต้องมียอดก่อนภาษีหรือยอดรวมอย่างน้อยหนึ่งค่า`);
      continue;
    }

    let accountId: string | null = defaultAccount?.id ?? null;
    if (row.accountCode) {
      const account = await prisma.chartOfAccount.findUnique({ where: { code: row.accountCode } });
      if (!account) {
        errors.push(`เลขที่ใบแจ้งหนี้ ${row.invoiceNumber}: ไม่พบรหัสผังบัญชี "${row.accountCode}"`);
        continue;
      }
      accountId = account.id;
    }

    const poNumberRef = row.poNumber || null;

    try {
      const { vendor, created: vendorCreated } = await findOrCreateVendorByName(row.vendorName);
      if (vendorCreated) vendorsCreated++;

      // invoiceNumber is unique per vendor here, not globally (unlike SalesInvoice.invoiceNumber)
      // — different vendors can legitimately reuse the same invoice numbering, so "already
      // imported" must be scoped to this vendor, not looked up as a global unique key.
      const existing = await prisma.accountsPayable.findFirst({
        where: { vendorId: vendor.id, invoiceNumber: row.invoiceNumber, status: { not: "CANCELLED" } },
        include: { paymentPrepItems: { include: { prep: true } } },
      });

      const dueDate = computeDueDate(invoiceDate, vendor.creditDays);

      if (existing) {
        const hasActivePrep = existing.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED");
        if (hasActivePrep) {
          skipped++;
          errors.push(`เลขที่ใบแจ้งหนี้ ${row.invoiceNumber}: ถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว ข้ามการอัปเดต`);
          continue;
        }
        const data = { vendorId: vendor.id, poNumberRef, invoiceDate, dueDate, amount, vatAmount, totalAmount, accountId };
        await prisma.accountsPayable.update({ where: { id: existing.id }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const apNumber = await getNextAPNumber();
        const ap = await prisma.accountsPayable.create({
          data: {
            apNumber,
            vendorId: vendor.id,
            poNumberRef,
            accountId,
            invoiceNumber: row.invoiceNumber,
            invoiceDate,
            dueDate,
            amount,
            vatAmount,
            totalAmount,
            notes: row.notes || null,
            createdByName,
            createdById,
          },
        });
        created++;
        toCreateInSheet.push(ap);
      }
    } catch {
      errors.push(`เลขที่ใบแจ้งหนี้ ${row.invoiceNumber}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await accountsPayableTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await accountsPayableTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/accounts-payable");
  return { created, updated, vendorsCreated, skipped, errors };
}
