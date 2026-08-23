"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { findOrCreateCustomerByName } from "./customers";
import { salesInvoicesTable, SalesInvoiceRecord } from "@/lib/sheets-tables";
import { getEffectiveInvoiceTotal } from "@/lib/sales-invoice-reconciliation";

const AMOUNT_TOLERANCE = 0.01;

// `creditDays` is null for a customer whose credit terms haven't been set yet (e.g. one
// auto-created by this file's CSV import). Falls back to 30 days so a dueDate can still be
// computed — this fallback is display-only and does NOT get written back onto the customer;
// the sales-invoices/customers UI separately flags such customers as missing credit data.
function computeDueDate(invoiceDate: Date, creditDays: number | null): Date {
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + (creditDays ?? 30));
  return due;
}

// `new Date(string)` is locale-ambiguous for slash-separated dates — it reads "12/05/2026"
// as MM/DD/YYYY (US), silently swapping day and month for any DD/MM/YYYY input (the format
// the rest of this app displays and the import UI instructs users to type when not using the
// ISO example). Parse both supported formats explicitly instead of trusting the built-in
// parser — and never fall back to it, since that fallback is exactly what reintroduces the
// MM/DD misread (e.g. for "21/08/2026 0:00:00", a trailing time from an Excel date/time cell,
// which doesn't match either strict pattern below).
function parseImportDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // Accepts DD/MM/YYYY with "/", "-", or "." as the separator, and tolerates a trailing
  // time component (e.g. from an Excel date/time cell exported to CSV as text).
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T].*)?$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    if (Number(m) > 12) return null;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
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
  discountAmount: number;
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
 * Use after a transaction that may have changed invoice status via syncInvoiceStatus() below.
 * Fetches all invoices in one query (not N parallel connections — Prisma's default pool
 * size, e.g. 3 on a 1-vCPU serverless function, was being exhausted once a receipt covered
 * more invoices than the pool, surfacing as a generic Server Components render error), then
 * syncs each to the Sheet in parallel — that part only hits the Sheets API, not Postgres. */
export async function syncInvoicesToSheetById(invoiceIds: string[]) {
  const uniqueIds = Array.from(new Set(invoiceIds));
  if (uniqueIds.length === 0) return;
  const invoices = await prisma.salesInvoice.findMany({ where: { id: { in: uniqueIds } } });
  await Promise.all(invoices.map((invoice) => syncInvoiceToSheet(invoice)));
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

// `month` is a "YYYY-MM" string (e.g. from an <input type="month">) filtering invoiceDate to
// that calendar month, in UTC — matching how dates are parsed/stored elsewhere in this file.
function monthRange(month: string): { gte: Date; lt: Date } | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const [, y, m] = match;
  const year = Number(y);
  const monthIndex = Number(m) - 1;
  return {
    gte: new Date(Date.UTC(year, monthIndex, 1)),
    lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export async function getSalesInvoices(search?: string, status?: string, month?: string) {
  const range = month ? monthRange(month) : null;
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
      ...(range ? { invoiceDate: range } : {}),
    },
    include: { customer: { select: { name: true, code: true, creditDays: true } } },
    orderBy: { invoiceDate: "desc" },
  });
}

export async function getAdjacentSalesInvoiceIds(id: string) {
  const rows = await prisma.salesInvoice.findMany({
    select: { id: true },
    orderBy: { invoiceDate: "desc" },
  });
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? rows[idx - 1].id : null,
    nextId: idx < rows.length - 1 ? rows[idx + 1].id : null,
  };
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

// Hard-deletes a sales invoice — unlike cancelSalesInvoice (which keeps the record as an
// audit trail with status CANCELLED), this removes it entirely. Only safe when nothing else
// references it: ReceiptItem.invoiceId and DebitCreditNote.invoiceId both have no
// onDelete: Cascade, so Postgres would reject this anyway — checking counts first just gives
// a clear Thai error instead of a raw FK-constraint failure.
export async function deleteSalesInvoice(id: string) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: { _count: { select: { receiptItems: true, debitCreditNotes: true } } },
  });
  if (!invoice) return;

  if (invoice._count.receiptItems > 0 || invoice._count.debitCreditNotes > 0) {
    throw new Error(
      `ไม่สามารถลบใบกำกับภาษีขาย "${invoice.invoiceNumber}" ได้ เนื่องจากมีการตัดชำระหรือใบเพิ่ม/ลดหนี้ผูกอยู่ กรุณายกเลิกรายการเหล่านั้นก่อน`
    );
  }

  await prisma.salesInvoice.delete({ where: { id } });
  try {
    await salesInvoicesTable.delete(id);
  } catch (err) {
    console.error("Sheet cleanup failed after deleteSalesInvoice:", err);
  }

  revalidatePath("/sales-invoices");
}

type ImportRow = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  amount?: number;
  discountAmount?: number;
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
    const invoiceDate = parseImportDate(row.invoiceDate);
    if (!invoiceDate) {
      errors.push(`เลขที่ใบกำกับภาษี ${row.invoiceNumber}: วันที่ไม่ถูกต้อง ("${row.invoiceDate}")`);
      continue;
    }
    const discountAmount = row.discountAmount ?? 0;
    const vatAmount = row.vatAmount ?? 0;
    // ยอดรวม = (ยอดก่อนภาษี - ส่วนลด) + VAT — discount reduces the pre-VAT base before VAT is added.
    const amount = row.amount ?? (row.totalAmount !== undefined ? row.totalAmount - vatAmount + discountAmount : undefined);
    const totalAmount = row.totalAmount ?? (amount !== undefined ? amount - discountAmount + vatAmount : undefined);
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
        const data = { invoiceDate, dueDate, customerId: customer.id, amount, discountAmount, vatAmount, totalAmount };
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
            discountAmount,
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
