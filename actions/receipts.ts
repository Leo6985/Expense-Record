"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncInvoiceStatus, syncInvoicesToSheetById } from "./sales-invoices";
import { receiptsTable, receiptItemsTable, ReceiptRecord, ReceiptItemRecord } from "@/lib/sheets-tables";

const AMOUNT_TOLERANCE = 0.01;

/**
 * Postgres remains authoritative (this table's id has no downstream FK from outside the
 * app), so every write dual-writes into the Google Sheet as a synced mirror. If the Sheet
 * side fails, the Postgres write already succeeded — surface the sync failure instead of
 * silently losing it, but don't roll back the Postgres write.
 */
async function syncReceiptToSheet(receipt: {
  id: string;
  receiptNumber: string;
  receiptDate: Date;
  companyBankAccountId: string;
  paymentMethod: string;
  referenceNumber: string | null;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: ReceiptRecord = { ...receipt };
  try {
    await receiptsTable.update(receipt.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await receiptsTable.create(record);
    } else {
      throw err;
    }
  }
}

async function syncReceiptItemsToSheet(receiptId: string, items: ReceiptItemRecord[]) {
  await receiptItemsTable.replaceWhere((r) => r.receiptId === receiptId, items);
}

export async function getReceipts(status?: string) {
  return prisma.receipt.findMany({
    where: status ? { status } : undefined,
    include: {
      items: { include: { invoice: { include: { customer: { select: { name: true } } } } } },
      companyBankAccount: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReceipt(id: string) {
  return prisma.receipt.findUnique({
    where: { id },
    include: {
      items: { include: { invoice: { include: { customer: true } } } },
      companyBankAccount: true,
    },
  });
}

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides with an existing number once any row in the middle of the sequence
// has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextReceiptNumber() {
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `RC${year}${month}`;
  const last = await prisma.receipt.findFirst({
    where: { receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.receiptNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

type ReceiptItemInput = { invoiceId: string; amount: number };

// Builds ReceiptItem rows for the given invoice selections, validating each amount
// against how much of that invoice's totalAmount is still unclaimed by other active
// receipts. `excludeReceiptId` lets an edit exclude the receipt's own current items.
async function buildReceiptItems(items: ReceiptItemInput[], excludeReceiptId?: string) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { id: { in: items.map((i) => i.invoiceId) } },
    include: { receiptItems: { include: { receipt: true } } },
  });

  return items.map((di) => {
    const invoice = invoices.find((a) => a.id === di.invoiceId);
    if (!invoice) throw new Error("ไม่พบใบกำกับภาษีขาย");
    if (di.amount <= 0) throw new Error(`จำนวนเงินสำหรับ ${invoice.invoiceNumber} ต้องมากกว่า 0`);

    const consumedByOthers = invoice.receiptItems
      .filter((item) => item.receipt.status !== "CANCELLED" && item.receiptId !== excludeReceiptId)
      .reduce((s, item) => s + item.amount, 0);
    const remaining = invoice.totalAmount - consumedByOthers;
    if (di.amount > remaining + AMOUNT_TOLERANCE) {
      throw new Error(
        `จำนวนเงินสำหรับ ${invoice.invoiceNumber} (${di.amount}) เกินยอดคงเหลือ (${Math.round(remaining * 100) / 100})`
      );
    }

    return { invoiceId: invoice.id, amount: di.amount };
  });
}

export async function createReceipt(data: {
  receiptDate: string;
  companyBankAccountId: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  items: ReceiptItemInput[];
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  if (data.items.length === 0) throw new Error("กรุณาเลือกใบกำกับภาษีขายอย่างน้อย 1 รายการ");

  const receiptNumber = await getNextReceiptNumber();
  const items = await buildReceiptItems(data.items);
  const totalAmount = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  const receipt = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.create({
      data: {
        receiptNumber,
        receiptDate: new Date(data.receiptDate),
        companyBankAccountId: data.companyBankAccountId,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        totalAmount,
        notes: data.notes,
        createdByName,
        createdById,
        items: { create: items },
      },
      include: { items: true },
    });

    for (const item of items) await syncInvoiceStatus(tx, item.invoiceId);

    return r;
  });

  await syncReceiptToSheet(receipt);
  await syncReceiptItemsToSheet(receipt.id, receipt.items);
  await syncInvoicesToSheetById(items.map((i) => i.invoiceId));

  revalidatePath("/receipts");
  revalidatePath("/sales-invoices");
  return receipt;
}

export async function updateReceipt(
  id: string,
  data: {
    receiptDate: string;
    companyBankAccountId: string;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
    items: ReceiptItemInput[];
  }
) {
  const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (receipt.status === "CANCELLED") throw new Error("ไม่สามารถแก้ไขการตัดชำระที่ยกเลิกแล้วได้");
  if (receipt.status === "APPROVED") throw new Error("ไม่สามารถแก้ไขได้ เนื่องจากอนุมัติแล้ว กรุณายกเลิกอนุมัติก่อน");
  if (data.items.length === 0) throw new Error("กรุณาเลือกใบกำกับภาษีขายอย่างน้อย 1 รายการ");

  const oldInvoiceIds = receipt.items.map((item) => item.invoiceId);
  const newItems = await buildReceiptItems(data.items, id);
  const totalAmount = Math.round(newItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.update({
      where: { id },
      data: {
        receiptDate: new Date(data.receiptDate),
        companyBankAccountId: data.companyBankAccountId,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        totalAmount,
        notes: data.notes,
        items: {
          deleteMany: {},
          create: newItems,
        },
      },
      include: { items: true },
    });

    const affectedInvoiceIds = Array.from(new Set([...oldInvoiceIds, ...newItems.map((i) => i.invoiceId)]));
    for (const invoiceId of affectedInvoiceIds) await syncInvoiceStatus(tx, invoiceId);

    return r;
  });

  await syncReceiptToSheet(updated);
  await syncReceiptItemsToSheet(id, updated.items);
  await syncInvoicesToSheetById([...oldInvoiceIds, ...newItems.map((i) => i.invoiceId)]);

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath("/sales-invoices");
}

export async function approveReceipt(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const existing = await prisma.receipt.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new Error("ไม่พบรายการรับชำระเงิน");
  if (existing.status !== "DRAFT") throw new Error("อนุมัติได้เฉพาะรายการที่ยังไม่อนุมัติเท่านั้น");

  const receipt = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.update({
      where: { id },
      data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
    });
    for (const item of existing.items) await syncInvoiceStatus(tx, item.invoiceId);
    return r;
  });

  await syncReceiptToSheet(receipt);
  await syncInvoicesToSheetById(existing.items.map((i) => i.invoiceId));

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath("/sales-invoices");
}

export async function unapproveReceipt(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const existing = await prisma.receipt.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new Error("ไม่พบรายการรับชำระเงิน");
  if (existing.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะรายการที่อนุมัติแล้วเท่านั้น");

  const receipt = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.update({
      where: { id },
      data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
    });
    for (const item of existing.items) await syncInvoiceStatus(tx, item.invoiceId);
    return r;
  });

  await syncReceiptToSheet(receipt);
  await syncInvoicesToSheetById(existing.items.map((i) => i.invoiceId));

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath("/sales-invoices");
}

export async function cancelReceipt(id: string) {
  const existing = await prisma.receipt.findUnique({ where: { id }, include: { items: true } });
  if (!existing) return;

  const invoiceIds = existing.items.map((item) => item.invoiceId);

  const receipt = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.update({ where: { id }, data: { status: "CANCELLED" } });
    for (const invoiceId of invoiceIds) await syncInvoiceStatus(tx, invoiceId);
    return r;
  });

  await syncReceiptToSheet(receipt);
  await syncInvoicesToSheetById(invoiceIds);

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath("/sales-invoices");
}

// Non-cancelled receipts deposited into one company bank account, for the "บัญชีบริษัท"
// page's per-account received-money history.
export async function getReceiptsForBankAccount(companyBankAccountId: string) {
  return prisma.receipt.findMany({
    where: { companyBankAccountId, status: { not: "CANCELLED" } },
    include: { items: { include: { invoice: { include: { customer: { select: { name: true } } } } } } },
    orderBy: { receiptDate: "desc" },
  });
}
