"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { accountsPayableTable, AccountsPayableRecord } from "@/lib/sheets-tables";

const AMOUNT_TOLERANCE = 0.01;

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
 * Use after a transaction that may have changed AP status via syncAPStatus() below. */
export async function syncAPsToSheetById(apIds: string[]) {
  const uniqueIds = Array.from(new Set(apIds));
  for (const id of uniqueIds) {
    const ap = await prisma.accountsPayable.findUnique({ where: { id } });
    if (ap) await syncAPToSheet(ap);
  }
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
    },
  });
}

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides with an existing number once any row in the middle of the sequence
// has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextAPNumber() {
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `AP${year}${month}`;
  const last = await prisma.accountsPayable.findFirst({
    where: { apNumber: { startsWith: prefix } },
    orderBy: { apNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.apNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function createAccountsPayable(data: {
  vendorId: string;
  poId?: string;
  grId?: string;
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
