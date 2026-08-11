"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { findOrCreateCustomerByName } from "./customers";
import { salesInvoicesTable, SalesInvoiceRecord } from "@/lib/sheets-tables";
import { getEffectiveInvoiceTotal } from "@/lib/sales-invoice-reconciliation";

const AMOUNT_TOLERANCE = 0.01;

function computeDueDate(invoiceDate: Date, creditDays: number): Date {
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + creditDays);
  return due;
}

/**
 * Postgres remains authoritative (ReceiptItem.invoiceId still holds a real FK into this
 * table's id), so every write dual-writes into the Google Sheet as a synced mirror. If the
 * Sheet side fails, the Postgres write already succeeded — surface the sync failure instead
 * of silently losing it, but don't roll back the Postgres write.
 */
export async function syncInvoiceToSheet(invoice: {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  customerId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: SalesInvoiceRecord = { ...invoice };
  try {
    await salesInvoicesTable.update(invoice.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await salesInvoicesTable.create(record);
    } else {
      throw err;
    }
  }
}

/** Re-fetches each invoice by id from Postgres and syncs its current state to the Sheet.
 * Use after a transaction that may have changed invoice status via syncInvoiceStatus() below. */
export async function syncInvoicesToSheetById(invoiceIds: string[]) {
  const uniqueIds = Array.from(new Set(invoiceIds));
  for (const id of uniqueIds) {
    const invoice = await prisma.salesInvoice.findUnique({ where: { id } });
    if (invoice) await syncInvoiceToSheet(invoice);
  }
}

// Sums how much of an invoice's effective total (totalAmount adjusted by any APPROVED debit/
// credit notes) has been committed to non-cancelled receipts, and reconciles invoice.status
// against it. Called after any receipt or debit/credit note create/edit/approve/unapprove/
// cancel so partially-settled invoices stay selectable for the remaining balance.
export async function syncInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await tx.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { receiptItems: { include: { receipt: true } }, debitCreditNotes: true },
  });
  if (invoice.status === "CANCELLED") return;

  const effectiveTotal = getEffectiveInvoiceTotal(invoice);
  const activeItems = invoice.receiptItems.filter((item) => item.receipt.status !== "CANCELLED");
  const consumed = activeItems.reduce((s, item) => s + item.amount, 0);
  const remaining = effectiveTotal - consumed;
  const allSettled = activeItems.length > 0 && activeItems.every((item) => item.receipt.status === "APPROVED");

  let newStatus = invoice.status;
  // A credit note can offset the invoice down to (or past) zero on its own, with no
  // receipt ever created — `allSettled` requires at least one receipt item, so that case
  // must be checked independently or a fully credited invoice stays PENDING forever
  // (and shows as overdue past its due date, which is wrong once nothing is owed).
  if (effectiveTotal <= AMOUNT_TOLERANCE) newStatus = "RECEIVED";
  else if (remaining <= AMOUNT_TOLERANCE && allSettled) newStatus = "RECEIVED";
  else if (consumed > AMOUNT_TOLERANCE) newStatus = "PARTIALLY_RECEIVED";
  else newStatus = "PENDING";

  if (newStatus !== invoice.status) {
    await tx.salesInvoice.update({ where: { id: invoiceId }, data: { status: newStatus } });
  }
}

export async function getSalesInvoices(search?: string, status?: string) {
  return prisma.salesInvoice.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: { customer: { select: { name: true, code: true } } },
    orderBy: { invoiceDate: "desc" },
  });
}

export async function getSalesInvoiceById(id: string) {
  return prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      customer: true,
      receiptItems: { include: { receipt: { include: { companyBankAccount: true } } } },
      debitCreditNotes: { orderBy: { noteDate: "asc" } },
    },
  });
}

// Lists invoices still open for a receipt (settlement), with each one's unclaimed balance.
// When editing an existing DRAFT receipt, pass its id as `excludeReceiptId` so that
// receipt's own items don't count against the invoice's remaining balance.
export async function getAvailableInvoicesForReceipt(excludeReceiptId?: string) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: ["PENDING", "PARTIALLY_RECEIVED"] } },
    include: {
      customer: { select: { name: true } },
      receiptItems: { include: { receipt: { select: { status: true } } } },
      debitCreditNotes: true,
    },
    orderBy: { invoiceDate: "asc" },
  });

  return invoices
    .map((invoice) => {
      const consumed = invoice.receiptItems
        .filter((item) => item.receipt.status !== "CANCELLED" && item.receiptId !== excludeReceiptId)
        .reduce((s, item) => s + item.amount, 0);
      const remainingAmount = Math.max(0, Math.round((getEffectiveInvoiceTotal(invoice) - consumed) * 100) / 100);
      return { ...invoice, remainingAmount };
    })
    .filter((invoice) => invoice.remainingAmount > AMOUNT_TOLERANCE);
}

export async function cancelSalesInvoice(id: string) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: { receiptItems: { include: { receipt: true } } },
  });
  if (!invoice) throw new Error("ไม่พบใบกำกับภาษีขาย");

  const hasActiveReceipt = invoice.receiptItems.some((item) => item.receipt.status !== "CANCELLED");
  if (hasActiveReceipt) throw new Error("ไม่สามารถยกเลิกได้ เนื่องจากมีการตัดชำระผูกอยู่แล้ว");

  const updated = await prisma.salesInvoice.update({ where: { id }, data: { status: "CANCELLED" } });
  await syncInvoiceToSheet(updated);

  revalidatePath("/sales-invoices");
  revalidatePath(`/sales-invoices/${id}`);
}

type ImportRow = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  amount?: number;
  vatAmount?: number;
  totalAmount?: number;
};

export async function importSalesInvoicesCSV(rows: ImportRow[]) {
  let created = 0;
  let updated = 0;
  let customersCreated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const toCreateInSheet: SalesInvoiceRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<SalesInvoiceRecord> }[] = [];

  for (const row of rows) {
    if (!row.invoiceNumber || !row.invoiceDate || !row.customerName) {
      errors.push(`แถว "${row.invoiceNumber || "?"}" : ต้องมีเลขที่ใบกำกับภาษี วันที่ และชื่อลูกค้า`);
      continue;
    }
    const invoiceDate = new Date(row.invoiceDate);
    if (Number.isNaN(invoiceDate.getTime())) {
      errors.push(`เลขที่ใบกำกับภาษี ${row.invoiceNumber}: วันที่ไม่ถูกต้อง`);
      continue;
    }
    const vatAmount = row.vatAmount ?? 0;
    const amount = row.amount ?? (row.totalAmount !== undefined ? row.totalAmount - vatAmount : undefined);
    const totalAmount = row.totalAmount ?? (amount !== undefined ? amount + vatAmount : undefined);
    if (amount === undefined || totalAmount === undefined) {
      errors.push(`เลขที่ใบกำกับภาษี ${row.invoiceNumber}: ต้องมียอดก่อนภาษีหรือยอดรวมอย่างน้อยหนึ่งค่า`);
      continue;
    }

    try {
      const { customer, created: customerCreated } = await findOrCreateCustomerByName(row.customerName);
      if (customerCreated) customersCreated++;

      const existing = await prisma.salesInvoice.findUnique({
        where: { invoiceNumber: row.invoiceNumber },
        include: { receiptItems: { include: { receipt: true } } },
      });

      const dueDate = computeDueDate(invoiceDate, customer.creditDays);

      if (existing) {
        const hasActiveReceipt = existing.receiptItems.some((item) => item.receipt.status !== "CANCELLED");
        if (hasActiveReceipt) {
          skipped++;
          errors.push(`เลขที่ใบกำกับภาษี ${row.invoiceNumber}: มีการตัดชำระแล้ว ข้ามการอัปเดต`);
          continue;
        }
        const data = { invoiceDate, dueDate, customerId: customer.id, amount, vatAmount, totalAmount };
        await prisma.salesInvoice.update({ where: { id: existing.id }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const invoice = await prisma.salesInvoice.create({
          data: {
            invoiceNumber: row.invoiceNumber,
            invoiceDate,
            dueDate,
            customerId: customer.id,
            amount,
            vatAmount,
            totalAmount,
            status: "PENDING",
          },
        });
        created++;
        toCreateInSheet.push(invoice);
      }
    } catch {
      errors.push(`เลขที่ใบกำกับภาษี ${row.invoiceNumber}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await salesInvoicesTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await salesInvoicesTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/sales-invoices");
  return { created, updated, customersCreated, skipped, errors };
}
