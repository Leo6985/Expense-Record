"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  journalVouchersTable,
  journalVoucherLinesTable,
  JournalVoucherRecord,
  JournalVoucherLineRecord,
} from "@/lib/sheets-tables";

const AMOUNT_TOLERANCE = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Postgres remains authoritative; every write dual-writes into the Google Sheet as a synced
 * mirror. If the Sheet side fails, the Postgres write already succeeded — surface the failure
 * but don't roll back Postgres. (Mirrors syncReceiptToSheet in actions/receipts.ts.)
 */
async function syncVoucherToSheet(voucher: JournalVoucherRecord) {
  try {
    await journalVouchersTable.update(voucher.id, voucher);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await journalVouchersTable.create(voucher);
    } else {
      throw err;
    }
  }
}

async function syncVoucherLinesToSheet(voucherId: string, lines: JournalVoucherLineRecord[]) {
  await journalVoucherLinesTable.replaceWhere((r) => r.voucherId === voucherId, lines);
}

export async function getJournalVouchers(search?: string) {
  return prisma.journalVoucher.findMany({
    where: search
      ? {
          OR: [
            { voucherNumber: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getJournalVoucher(id: string) {
  return prisma.journalVoucher.findUnique({
    where: { id },
    include: {
      lines: {
        include: { account: { select: { code: true, name: true } } },
        orderBy: { lineNo: "asc" },
      },
    },
  });
}

export async function getAdjacentJournalVoucherIds(id: string) {
  const rows = await prisma.journalVoucher.findMany({
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

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides once a middle row is deleted. JV + 4-digit Gregorian year + 2-digit
// month + 3-digit sequence, matching PO/AP/GR/PP (see scripts/migrate-doc-numbers.ts).
export async function getNextVoucherNumber(voucherDate: Date) {
  const year = String(voucherDate.getUTCFullYear());
  const month = String(voucherDate.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `JV${year}${month}`;
  const last = await prisma.journalVoucher.findFirst({
    where: { voucherNumber: { startsWith: prefix } },
    orderBy: { voucherNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.voucherNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

// รายการผังบัญชีสำหรับ dropdown เลือกบัญชีในแต่ละบรรทัด (สมุดรายวันทั่วไปแตะได้ทุกบัญชี)
export async function getAccountsForJournal() {
  return prisma.chartOfAccount.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export type JournalLineInput = {
  accountId: string;
  department?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
};

type JournalVoucherInput = {
  voucherDate: string;
  description: string;
  notes?: string | null;
  lines: JournalLineInput[];
};

// ตรวจความถูกต้องของบรรทัดและยอดเดบิต/เครดิต — คืนบรรทัดที่ทำความสะอาดแล้ว + ยอดรวม
function validateAndBuildLines(input: JournalVoucherInput) {
  if (!input.description?.trim()) throw new Error("กรุณากรอกรายละเอียด");

  const cleaned = input.lines
    .map((l) => ({
      accountId: l.accountId,
      department: l.department?.trim() || null,
      description: l.description?.trim() || null,
      debit: round2(Number(l.debit) || 0),
      credit: round2(Number(l.credit) || 0),
    }))
    .filter((l) => l.accountId || l.debit !== 0 || l.credit !== 0);

  if (cleaned.length < 2) throw new Error("ต้องมีบรรทัดรายการอย่างน้อย 2 บรรทัด");

  cleaned.forEach((l, i) => {
    const no = i + 1;
    if (!l.accountId) throw new Error(`บรรทัดที่ ${no}: กรุณาเลือกผังบัญชี`);
    if (l.debit < 0 || l.credit < 0) throw new Error(`บรรทัดที่ ${no}: จำนวนเงินต้องไม่ติดลบ`);
    if (l.debit === 0 && l.credit === 0) throw new Error(`บรรทัดที่ ${no}: ต้องระบุเดบิตหรือเครดิต`);
    if (l.debit > 0 && l.credit > 0) throw new Error(`บรรทัดที่ ${no}: ระบุได้อย่างใดอย่างหนึ่ง เดบิตหรือเครดิต`);
  });

  const totalDebit = round2(cleaned.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(cleaned.reduce((s, l) => s + l.credit, 0));
  if (totalDebit <= 0) throw new Error("ยอดรวมต้องมากกว่า 0");
  if (Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
    throw new Error(`เดบิตรวม (${totalDebit.toLocaleString()}) ไม่เท่ากับเครดิตรวม (${totalCredit.toLocaleString()})`);
  }

  // ตรวจว่าผังบัญชีที่เลือกมีอยู่จริงและยังใช้งานอยู่
  return { cleaned, totalDebit, totalCredit };
}

async function assertAccountsExist(accountIds: string[]) {
  const found = await prisma.chartOfAccount.count({ where: { id: { in: accountIds } } });
  if (found !== new Set(accountIds).size) throw new Error("มีผังบัญชีบางบรรทัดไม่ถูกต้อง");
}

function toLineRecords(voucherId: string, lines: { id: string; lineNo: number; accountId: string; department: string | null; description: string | null; debit: number; credit: number }[]): JournalVoucherLineRecord[] {
  return lines.map((l) => ({
    id: l.id,
    voucherId,
    lineNo: l.lineNo,
    accountId: l.accountId,
    department: l.department,
    description: l.description,
    debit: l.debit,
    credit: l.credit,
  }));
}

export async function createJournalVoucher(data: JournalVoucherInput) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const { cleaned, totalDebit, totalCredit } = validateAndBuildLines(data);
  await assertAccountsExist(cleaned.map((l) => l.accountId));

  const voucherNumber = await getNextVoucherNumber(new Date(data.voucherDate));

  const voucher = await prisma.journalVoucher.create({
    data: {
      voucherNumber,
      voucherDate: new Date(data.voucherDate),
      description: data.description.trim(),
      notes: data.notes?.trim() || null,
      totalDebit,
      totalCredit,
      createdByName,
      createdById,
      lines: {
        create: cleaned.map((l, i) => ({ ...l, lineNo: i + 1 })),
      },
    },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  try {
    await syncVoucherToSheet(voucher);
    await syncVoucherLinesToSheet(voucher.id, toLineRecords(voucher.id, voucher.lines));
  } catch (err) {
    console.error("syncToSheet failed after createJournalVoucher:", err);
  }

  revalidatePath("/journal-vouchers");
  return voucher;
}

export async function updateJournalVoucher(id: string, data: JournalVoucherInput) {
  const existing = await prisma.journalVoucher.findUnique({ where: { id } });
  if (!existing) throw new Error("ไม่พบใบสำคัญรายวัน");
  if (existing.status !== "DRAFT") throw new Error("แก้ไขได้เฉพาะเอกสารที่ยังไม่อนุมัติ กรุณายกเลิกอนุมัติก่อน");

  const { cleaned, totalDebit, totalCredit } = validateAndBuildLines(data);
  await assertAccountsExist(cleaned.map((l) => l.accountId));

  const voucher = await prisma.journalVoucher.update({
    where: { id },
    data: {
      voucherDate: new Date(data.voucherDate),
      description: data.description.trim(),
      notes: data.notes?.trim() || null,
      totalDebit,
      totalCredit,
      lines: {
        deleteMany: {},
        create: cleaned.map((l, i) => ({ ...l, lineNo: i + 1 })),
      },
    },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  try {
    await syncVoucherToSheet(voucher);
    await syncVoucherLinesToSheet(voucher.id, toLineRecords(voucher.id, voucher.lines));
  } catch (err) {
    console.error("syncToSheet failed after updateJournalVoucher:", err);
  }

  revalidatePath("/journal-vouchers");
  revalidatePath(`/journal-vouchers/${id}`);
  return voucher;
}

export async function approveJournalVoucher(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const existing = await prisma.journalVoucher.findUnique({ where: { id } });
  if (!existing) throw new Error("ไม่พบใบสำคัญรายวัน");
  if (existing.status !== "DRAFT") throw new Error("อนุมัติได้เฉพาะเอกสารที่ยังไม่อนุมัติ");
  if (Math.abs(existing.totalDebit - existing.totalCredit) > AMOUNT_TOLERANCE)
    throw new Error("เดบิตรวมไม่เท่ากับเครดิตรวม ไม่สามารถอนุมัติได้");

  const voucher = await prisma.journalVoucher.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
  });

  try {
    await syncVoucherToSheet(voucher);
  } catch (err) {
    console.error("syncToSheet failed after approveJournalVoucher:", err);
  }

  revalidatePath("/journal-vouchers");
  revalidatePath(`/journal-vouchers/${id}`);
}

export async function unapproveJournalVoucher(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกอนุมัติได้");

  const existing = await prisma.journalVoucher.findUnique({ where: { id } });
  if (!existing) throw new Error("ไม่พบใบสำคัญรายวัน");
  if (existing.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะเอกสารที่อนุมัติแล้ว");

  const voucher = await prisma.journalVoucher.update({
    where: { id },
    data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
  });

  try {
    await syncVoucherToSheet(voucher);
  } catch (err) {
    console.error("syncToSheet failed after unapproveJournalVoucher:", err);
  }

  revalidatePath("/journal-vouchers");
  revalidatePath(`/journal-vouchers/${id}`);
}

// ลบถาวร เฉพาะเอกสารที่ยังไม่อนุมัติ (เอกสารที่อนุมัติแล้วต้องยกเลิกอนุมัติก่อน)
export async function deleteJournalVoucher(id: string) {
  const existing = await prisma.journalVoucher.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.status !== "DRAFT") throw new Error("ลบได้เฉพาะเอกสารที่ยังไม่อนุมัติ");

  await prisma.journalVoucher.delete({ where: { id } });

  try {
    await journalVoucherLinesTable.deleteWhere((r) => r.voucherId === id);
    await journalVouchersTable.delete(id);
  } catch (err) {
    console.error("Sheet cleanup failed after deleteJournalVoucher:", err);
  }

  revalidatePath("/journal-vouchers");
}
