"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  journalVouchersTable,
  journalVoucherLinesTable,
  JournalVoucherRecord,
  JournalVoucherLineRecord,
} from "@/lib/sheets-tables";

const round2 = (n: number) => Math.round(n * 100) / 100;
const AMOUNT_TOLERANCE = 0.01;

// ผังบัญชีคุมยอดที่จำเป็นสำหรับคู่บัญชีขาย (ดู lib/ledger.ts step 2)
const REQUIRED_CONFIG_KEYS = ["ar", "revenue", "vat_output"] as const;

export type SalesJournalRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  debitAR: number;
  creditRevenue: number;
  creditVat: number;
  invoiceStatus: string;
  voucherId: string | null;
  voucherNumber: string | null;
  voucherStatus: string | null; // DRAFT | APPROVED | null (ยังไม่สร้าง)
};

export type SalesJournalView = {
  rows: SalesJournalRow[];
  totals: { debitAR: number; creditRevenue: number; creditVat: number };
  pendingCount: number; // จำนวนใบกำกับในช่วงที่ยังไม่มี Voucher
  configMissing: string[]; // keys ของผังบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า
  from: string;
  to: string;
};

export async function getSalesJournal(params: {
  from: string;
  to: string;
}): Promise<SalesJournalView> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [invoices, vouchers, config] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: fromDate, lte: toDate } },
      include: { customer: { select: { name: true } } },
      orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
    }),
    prisma.journalVoucher.findMany({
      where: { sourceType: "SI" },
      select: { id: true, voucherNumber: true, status: true, sourceId: true },
    }),
    prisma.accountingConfig.findMany({ where: { key: { in: [...REQUIRED_CONFIG_KEYS] } } }),
  ]);

  const voucherByInvoice = new Map(vouchers.map((v) => [v.sourceId ?? "", v]));
  const cfg = new Map(config.map((c) => [c.key, c.accountId]));
  const configMissing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg.get(k));

  let pendingCount = 0;
  const rows: SalesJournalRow[] = invoices.map((inv) => {
    const v = voucherByInvoice.get(inv.id) ?? null;
    if (!v) pendingCount++;
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      customerName: inv.customer.name,
      debitAR: round2(inv.totalAmount),
      creditRevenue: round2(inv.amount - inv.discountAmount),
      creditVat: round2(inv.vatAmount),
      invoiceStatus: inv.status,
      voucherId: v?.id ?? null,
      voucherNumber: v?.voucherNumber ?? null,
      voucherStatus: v?.status ?? null,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      debitAR: round2(t.debitAR + r.debitAR),
      creditRevenue: round2(t.creditRevenue + r.creditRevenue),
      creditVat: round2(t.creditVat + r.creditVat),
    }),
    { debitAR: 0, creditRevenue: 0, creditVat: 0 }
  );

  return { rows, totals, pendingCount, configMissing, from, to };
}

export type GenerateSalesVouchersResult = {
  created: number;
  skipped: number; // ใบกำกับที่มี Voucher อยู่แล้ว
  errors: string[];
};

/**
 * สร้างใบสำคัญรายวัน (JournalVoucher) หนึ่งใบต่อใบกำกับภาษีขายหนึ่งใบ สำหรับใบกำกับในช่วงวันที่ที่เลือก
 * ที่ยังไม่มีใบสำคัญ (sourceType = "SI"). สร้างเป็นสถานะ DRAFT — ต้องอนุมัติเองในสมุดรายวันทั่วไป
 * จึงจะเข้าบัญชีแยกประเภท/งบทดลอง.
 *
 * กันการซ้ำ 2 ชั้น:
 *   1. กรองใบกำกับที่มีใบสำคัญ sourceType "SI" อยู่แล้วออกก่อนสร้าง
 *   2. คอลัมน์ @@unique([sourceType, sourceId]) บน JournalVoucher เป็นด่านสุดท้าย — หากมีการสร้าง
 *      พร้อมกันจนชน unique (P2002) จะนับเป็น skip ไม่ใช่ error ที่ทำให้ทั้งชุดล้ม
 *
 * คู่บัญชีต่อใบ: Dr ลูกหนี้การค้า (ar) = totalAmount, Cr รายได้ (revenue) = amount − discount,
 * Cr ภาษีขาย (vat_output) = vatAmount (ข้ามบรรทัดถ้าเป็น 0). ใช้ผังบัญชีคุมยอดชุดเดียวกับ buildLedger.
 */
export async function generateSalesVouchers(params: {
  from: string;
  to: string;
}): Promise<GenerateSalesVouchersResult> {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const config = await prisma.accountingConfig.findMany({
    where: { key: { in: [...REQUIRED_CONFIG_KEYS] } },
  });
  const cfg = new Map(config.map((c) => [c.key, c.accountId]));
  const arId = cfg.get("ar") || null;
  const revId = cfg.get("revenue") || null;
  const vatId = cfg.get("vat_output") || null;
  const missing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg.get(k));
  if (missing.length > 0) {
    throw new Error(
      `ยังไม่ได้ตั้งค่าผังบัญชีคุมยอด: ${missing.join(", ")} — กรุณาตั้งค่าที่หน้า "ตั้งค่าผังบัญชีคุมยอด" ก่อนสร้าง Voucher`
    );
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { not: "CANCELLED" }, invoiceDate: { gte: fromDate, lte: toDate } },
    include: { customer: { select: { name: true } } },
    orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
  });
  if (invoices.length === 0) return { created: 0, skipped: 0, errors: [] };

  const existing = await prisma.journalVoucher.findMany({
    where: { sourceType: "SI", sourceId: { in: invoices.map((i) => i.id) } },
    select: { sourceId: true },
  });
  const done = new Set(existing.map((e) => e.sourceId));
  const todo = invoices.filter((i) => !done.has(i.id));
  if (todo.length === 0) return { created: 0, skipped: invoices.length, errors: [] };

  // ลำดับเลขที่ใบสำคัญต่อ prefix เดือน (JV + ปี ค.ศ. + เดือน) — seed จากเลขล่าสุดในฐานข้อมูล
  const seq = new Map<string, number>();
  async function nextVoucherNumber(date: Date): Promise<string> {
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
  }

  let created = 0;
  let skipped = done.size;
  const errors: string[] = [];
  const voucherRecords: JournalVoucherRecord[] = [];
  const lineRecords: JournalVoucherLineRecord[] = [];

  for (const inv of todo) {
    const ar = round2(inv.totalAmount);
    const revenue = round2(inv.amount - inv.discountAmount);
    const vat = round2(inv.vatAmount);

    const lines: { accountId: string; debit: number; credit: number }[] = [
      { accountId: arId!, debit: ar, credit: 0 },
      { accountId: revId!, debit: 0, credit: revenue },
    ];
    if (vat !== 0) lines.push({ accountId: vatId!, debit: 0, credit: vat });

    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
      errors.push(
        `${inv.invoiceNumber}: เดบิต (${totalDebit.toLocaleString()}) ≠ เครดิต (${totalCredit.toLocaleString()}) — ข้าม`
      );
      continue;
    }

    try {
      const voucherNumber = await nextVoucherNumber(inv.invoiceDate);
      const voucher = await prisma.journalVoucher.create({
        data: {
          voucherNumber,
          voucherDate: inv.invoiceDate,
          description: `ขาย — ${inv.customer.name} (${inv.invoiceNumber})`,
          notes: "สร้างอัตโนมัติจากใบกำกับภาษีขาย (สมุดรายวันขาย)",
          status: "DRAFT",
          totalDebit,
          totalCredit,
          sourceType: "SI",
          sourceId: inv.id,
          createdByName,
          createdById,
          lines: {
            create: lines.map((l, i) => ({
              lineNo: i + 1,
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              department: null,
              description: null,
            })),
          },
        },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });
      created++;
      voucherRecords.push({
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        voucherDate: voucher.voucherDate,
        description: voucher.description,
        status: voucher.status,
        totalDebit: voucher.totalDebit,
        totalCredit: voucher.totalCredit,
        notes: voucher.notes,
        createdByName: voucher.createdByName,
        createdById: voucher.createdById,
        approvedByName: voucher.approvedByName,
        approvedById: voucher.approvedById,
        approvedAt: voucher.approvedAt,
        createdAt: voucher.createdAt,
        updatedAt: voucher.updatedAt,
      });
      for (const l of voucher.lines) {
        lineRecords.push({
          id: l.id,
          voucherId: voucher.id,
          lineNo: l.lineNo,
          accountId: l.accountId,
          department: l.department,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
        });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped++; // มีผู้สร้าง Voucher ให้ใบกำกับนี้ไปแล้วระหว่างทาง
      } else {
        errors.push(`${inv.invoiceNumber}: สร้างไม่สำเร็จ`);
      }
    }
  }

  // ซิงค์เข้า Google Sheet เป็นสำเนา (best-effort) — Postgres เป็นฐานหลักอยู่แล้ว
  try {
    if (voucherRecords.length > 0) await journalVouchersTable.createMany(voucherRecords);
    if (lineRecords.length > 0) await journalVoucherLinesTable.createMany(lineRecords);
  } catch (err) {
    console.error("syncToSheet failed after generateSalesVouchers:", err);
  }

  revalidatePath("/sales-journal");
  revalidatePath("/journal-vouchers");
  return { created, skipped, errors };
}
