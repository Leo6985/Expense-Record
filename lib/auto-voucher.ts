import { prisma } from "./prisma";
import {
  journalVouchersTable,
  journalVoucherLinesTable,
  JournalVoucherRecord,
  JournalVoucherLineRecord,
} from "./sheets-tables";

// ตัวช่วยที่แชร์กันระหว่างสมุดรายวันขาย (actions/sales-journal.ts) และสมุดรายวันซื้อ
// (actions/purchase-journal.ts) — วางไว้ใน lib/ เพราะ Next.js บังคับให้ทุก export ของไฟล์
// "use server" เป็น async server action จึงแชร์ฟังก์ชันธรรมดาระหว่าง actions/*.ts โดยตรงไม่ได้
// (เหตุผลเดียวกับ lib/invoice-due-dates.ts).

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const AMOUNT_TOLERANCE = 0.01;

export type GeneratedLine = {
  accountId: string;
  debit: number;
  credit: number;
};

/**
 * ตัวสร้างเลขที่ใบสำคัญต่อ prefix เดือน (JV + ปี ค.ศ. + เดือน) — seed จากเลขล่าสุดในฐานข้อมูล
 * ครั้งแรกที่พบ prefix นั้น แล้วเดินต่อในหน่วยความจำ เพื่อให้สร้างหลายใบในรอบเดียวไม่ชนกันเอง.
 */
export function voucherNumberSequencer() {
  const seq = new Map<string, number>();
  return async function next(date: Date): Promise<string> {
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const prefix = `JV${year}${month}`;
    if (!seq.has(prefix)) {
      const last = await prisma.journalVoucher.findFirst({
        where: { voucherNumber: { startsWith: prefix } },
        orderBy: { voucherNumber: "desc" },
      });
      seq.set(prefix, last ? parseInt(last.voucherNumber.slice(prefix.length)) || 0 : 0);
    }
    const n = seq.get(prefix)! + 1;
    seq.set(prefix, n);
    return `${prefix}${String(n).padStart(3, "0")}`;
  };
}

type VoucherWithLines = {
  id: string;
  voucherNumber: string;
  voucherDate: Date;
  description: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: {
    id: string;
    lineNo: number;
    accountId: string;
    department: string | null;
    description: string | null;
    debit: number;
    credit: number;
  }[];
};

export function toVoucherRecord(v: VoucherWithLines): JournalVoucherRecord {
  return {
    id: v.id,
    voucherNumber: v.voucherNumber,
    voucherDate: v.voucherDate,
    description: v.description,
    status: v.status,
    totalDebit: v.totalDebit,
    totalCredit: v.totalCredit,
    notes: v.notes,
    createdByName: v.createdByName,
    createdById: v.createdById,
    approvedByName: v.approvedByName,
    approvedById: v.approvedById,
    approvedAt: v.approvedAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export function toLineRecords(v: VoucherWithLines): JournalVoucherLineRecord[] {
  return v.lines.map((l) => ({
    id: l.id,
    voucherId: v.id,
    lineNo: l.lineNo,
    accountId: l.accountId,
    department: l.department,
    description: l.description,
    debit: l.debit,
    credit: l.credit,
  }));
}

/**
 * ซิงค์ใบสำคัญที่สร้างอัตโนมัติเข้า Google Sheet เป็นสำเนา (best-effort) — Postgres เป็นฐานหลัก
 * อยู่แล้ว หาก Sheet ล้มเหลวก็แค่ log ไม่ throw. sourceType/sourceId ไม่ถูกซิงค์ (ไม่มีคอลัมน์ในชีต).
 */
export async function syncGeneratedVouchersToSheet(
  voucherRecords: JournalVoucherRecord[],
  lineRecords: JournalVoucherLineRecord[]
) {
  try {
    if (voucherRecords.length > 0) await journalVouchersTable.createMany(voucherRecords);
    if (lineRecords.length > 0) await journalVoucherLinesTable.createMany(lineRecords);
  } catch (err) {
    console.error("syncGeneratedVouchersToSheet failed:", err);
  }
}
