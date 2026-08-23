"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncInvoiceStatus, syncInvoicesToSheetById } from "./sales-invoices";
import { debitCreditNotesTable, DebitCreditNoteRecord } from "@/lib/sheets-tables";

const TYPE_PREFIX: Record<string, string> = { DEBIT: "DN", CREDIT: "CN" };

/**
 * Postgres remains authoritative (this table's id has no downstream FK from outside the
 * app), so every write dual-writes into the Google Sheet as a synced mirror. If the Sheet
 * side fails, the Postgres write already succeeded — surface the sync failure instead of
 * silently losing it, but don't roll back the Postgres write.
 */
async function syncNoteToSheet(note: {
  id: string;
  noteNumber: string;
  type: string;
  noteDate: Date;
  invoiceId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  reason: string | null;
  detail: string | null;
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
  const record: DebitCreditNoteRecord = { ...note };
  try {
    await debitCreditNotesTable.update(note.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await debitCreditNotesTable.create(record);
    } else {
      throw err;
    }
  }
}

export async function getDebitCreditNotes(search?: string, type?: string, status?: string) {
  return prisma.debitCreditNote.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { noteNumber: { contains: search, mode: "insensitive" } },
              { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
              { invoice: { customer: { name: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    },
    include: { invoice: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAdjacentDebitCreditNoteIds(id: string) {
  const rows = await prisma.debitCreditNote.findMany({
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

export async function getDebitCreditNote(id: string) {
  return prisma.debitCreditNote.findUnique({
    where: { id },
    include: { invoice: { include: { customer: true } } },
  });
}

// Sequences by the highest existing number for this month's prefix (per type), not by row
// count — count() collides with an existing number once any row in the middle of the
// sequence has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextNoteNumber(type: "DEBIT" | "CREDIT") {
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `${TYPE_PREFIX[type]}${year}${month}`;
  const last = await prisma.debitCreditNote.findFirst({
    where: { noteNumber: { startsWith: prefix } },
    orderBy: { noteNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.noteNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function createDebitCreditNote(data: {
  type: "DEBIT" | "CREDIT";
  invoiceId: string;
  noteDate: string;
  amount: number;
  vatAmount?: number;
  reason?: string;
  detail?: string;
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const invoice = await prisma.salesInvoice.findUnique({ where: { id: data.invoiceId } });
  if (!invoice) throw new Error("ไม่พบใบกำกับภาษีขาย");
  if (invoice.status === "CANCELLED") throw new Error("ไม่สามารถออกใบเพิ่ม/ลดหนี้ให้ใบกำกับภาษีที่ยกเลิกแล้วได้");
  if (data.amount <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");

  const noteNumber = await getNextNoteNumber(data.type);
  const vatAmount = data.vatAmount ?? 0;
  const totalAmount = Math.round((data.amount + vatAmount) * 100) / 100;

  const note = await prisma.debitCreditNote.create({
    data: {
      noteNumber,
      type: data.type,
      noteDate: new Date(data.noteDate),
      invoiceId: data.invoiceId,
      amount: data.amount,
      vatAmount,
      totalAmount,
      reason: data.reason,
      detail: data.detail,
      notes: data.notes,
      createdByName,
      createdById,
    },
  });
  await syncNoteToSheet(note);

  revalidatePath("/debit-credit-notes");
  return note;
}

export async function updateDebitCreditNote(
  id: string,
  data: {
    noteDate: string;
    amount: number;
    vatAmount?: number;
    reason?: string;
    detail?: string;
    notes?: string;
  }
) {
  const existing = await prisma.debitCreditNote.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "DRAFT") throw new Error("แก้ไขได้เฉพาะรายการที่ยังไม่อนุมัติเท่านั้น");
  if (data.amount <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");

  const vatAmount = data.vatAmount ?? 0;
  const totalAmount = Math.round((data.amount + vatAmount) * 100) / 100;

  const note = await prisma.debitCreditNote.update({
    where: { id },
    data: {
      noteDate: new Date(data.noteDate),
      amount: data.amount,
      vatAmount,
      totalAmount,
      reason: data.reason,
      detail: data.detail,
      notes: data.notes,
    },
  });
  await syncNoteToSheet(note);

  revalidatePath("/debit-credit-notes");
  revalidatePath(`/debit-credit-notes/${id}`);
  return note;
}

export async function approveDebitCreditNote(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const existing = await prisma.debitCreditNote.findUnique({ where: { id } });
  if (!existing) throw new Error("ไม่พบรายการ");
  if (existing.status !== "DRAFT") throw new Error("อนุมัติได้เฉพาะรายการที่ยังไม่อนุมัติเท่านั้น");

  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.debitCreditNote.update({
      where: { id },
      data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
    });
    await syncInvoiceStatus(tx, existing.invoiceId);
    return n;
  });

  await syncNoteToSheet(note);
  await syncInvoicesToSheetById([existing.invoiceId]);

  revalidatePath("/debit-credit-notes");
  revalidatePath(`/debit-credit-notes/${id}`);
  revalidatePath("/sales-invoices");
  revalidatePath(`/sales-invoices/${existing.invoiceId}`);
}

export async function unapproveDebitCreditNote(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const existing = await prisma.debitCreditNote.findUnique({ where: { id } });
  if (!existing) throw new Error("ไม่พบรายการ");
  if (existing.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะรายการที่อนุมัติแล้วเท่านั้น");

  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.debitCreditNote.update({
      where: { id },
      data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
    });
    await syncInvoiceStatus(tx, existing.invoiceId);
    return n;
  });

  await syncNoteToSheet(note);
  await syncInvoicesToSheetById([existing.invoiceId]);

  revalidatePath("/debit-credit-notes");
  revalidatePath(`/debit-credit-notes/${id}`);
  revalidatePath("/sales-invoices");
  revalidatePath(`/sales-invoices/${existing.invoiceId}`);
}

export async function cancelDebitCreditNote(id: string) {
  const existing = await prisma.debitCreditNote.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.status === "CANCELLED") return;

  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.debitCreditNote.update({ where: { id }, data: { status: "CANCELLED" } });
    await syncInvoiceStatus(tx, existing.invoiceId);
    return n;
  });

  await syncNoteToSheet(note);
  await syncInvoicesToSheetById([existing.invoiceId]);

  revalidatePath("/debit-credit-notes");
  revalidatePath(`/debit-credit-notes/${id}`);
  revalidatePath("/sales-invoices");
  revalidatePath(`/sales-invoices/${existing.invoiceId}`);
}

// Hard-deletes a debit/credit note — unlike cancelDebitCreditNote (which keeps the record as
// an audit trail with status CANCELLED), this removes it entirely. Only safe while DRAFT:
// getEffectiveInvoiceTotal only ever counts APPROVED notes, so a DRAFT note never affected any
// invoice's reconciled total/status and no syncInvoiceStatus call is needed on delete.
export async function deleteDebitCreditNote(id: string) {
  const existing = await prisma.debitCreditNote.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.status !== "DRAFT") throw new Error("ลบได้เฉพาะรายการที่ยังไม่อนุมัติเท่านั้น");

  await prisma.debitCreditNote.delete({ where: { id } });
  try {
    await debitCreditNotesTable.delete(id);
  } catch (err) {
    console.error("Sheet cleanup failed after deleteDebitCreditNote:", err);
  }

  revalidatePath("/debit-credit-notes");
}

// Any non-cancelled sales invoice can be referenced, including ones already fully RECEIVED —
// debit/credit notes are corrections and may need to be issued after settlement.
export async function searchInvoicesForNote(search: string) {
  if (!search.trim()) return [];
  return prisma.salesInvoice.findMany({
    where: {
      status: { not: "CANCELLED" },
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ],
    },
    include: { customer: { select: { name: true } } },
    orderBy: { invoiceDate: "desc" },
    take: 20,
  });
}
