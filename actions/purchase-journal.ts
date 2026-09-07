"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  round2,
  AMOUNT_TOLERANCE,
  voucherNumberSequencer,
  toVoucherRecord,
  toLineRecords,
  syncGeneratedVouchersToSheet,
} from "@/lib/auto-voucher";
import { JournalVoucherRecord, JournalVoucherLineRecord } from "@/lib/sheets-tables";

// ผังบัญชีคุมยอดที่จำเป็นสำหรับคู่บัญชีซื้อ/ตั้งหนี้ (ดู lib/ledger.ts step 6)
const REQUIRED_CONFIG_KEYS = ["ap", "vat_input", "ap_suspense"] as const;

// คีย์กันซ้ำระดับข้อมูล: ผู้ขายเดียวกัน + เลขที่ใบกำกับเดียวกัน (ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย)
const dupKey = (vendorId: string, invoiceNumber: string) =>
  `${vendorId}::${invoiceNumber.trim().toLowerCase()}`;

export type PurchaseJournalRow = {
  apId: string;
  apNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  source: "GR" | "DIRECT"; // มาจากการรับสินค้า (มี grId) หรือบันทึกตรง/นำเข้า CSV
  creditAP: number; // เจ้าหนี้การค้า = totalAmount
  debitVat: number; // ภาษีซื้อ = vatAmount
  debitExpense: number; // ค่าใช้จ่าย/สินค้า = amount (ก่อน VAT)
  apStatus: string;
  duplicate: boolean; // มี AP ใบอื่นที่ผู้ขาย+เลขที่ใบกำกับซ้ำกัน
  voucherId: string | null;
  voucherNumber: string | null;
  voucherStatus: string | null; // DRAFT | APPROVED | null
};

export type PurchaseJournalView = {
  rows: PurchaseJournalRow[];
  totals: { creditAP: number; debitVat: number; debitExpense: number };
  pendingCount: number;
  duplicateGroups: { key: string; vendorName: string; invoiceNumber: string; apNumbers: string[] }[];
  configMissing: string[];
  from: string;
  to: string;
};

export async function getPurchaseJournal(params: {
  from: string;
  to: string;
}): Promise<PurchaseJournalView> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [aps, vouchers, config] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        apNumber: true,
        invoiceNumber: true,
        invoiceDate: true,
        amount: true,
        vatAmount: true,
        totalAmount: true,
        grId: true,
        vendorId: true,
        vendor: { select: { name: true } },
        status: true,
      },
      orderBy: [{ invoiceDate: "asc" }, { apNumber: "asc" }],
    }),
    prisma.journalVoucher.findMany({
      where: { sourceType: "AP" },
      select: { id: true, voucherNumber: true, status: true, sourceId: true },
    }),
    prisma.accountingConfig.findMany({ where: { key: { in: [...REQUIRED_CONFIG_KEYS] } } }),
  ]);

  const voucherByAP = new Map(vouchers.map((v) => [v.sourceId ?? "", v]));
  const cfg = new Map(config.map((c) => [c.key, c.accountId]));
  const configMissing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg.get(k));

  // จัดกลุ่มหาใบที่ผู้ขาย+เลขที่ใบกำกับซ้ำกัน (นับเฉพาะเลขที่ใบกำกับที่ไม่ว่าง)
  const byDupKey = new Map<string, typeof aps>();
  for (const ap of aps) {
    if (!ap.invoiceNumber?.trim()) continue;
    const k = dupKey(ap.vendorId, ap.invoiceNumber);
    const arr = byDupKey.get(k) ?? [];
    arr.push(ap);
    byDupKey.set(k, arr);
  }
  const dupKeys = new Set([...byDupKey.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
  const duplicateGroups = [...byDupKey.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({
      key,
      vendorName: v[0].vendor.name,
      invoiceNumber: v[0].invoiceNumber,
      apNumbers: v.map((a) => a.apNumber),
    }));

  let pendingCount = 0;
  const rows: PurchaseJournalRow[] = aps.map((ap) => {
    const v = voucherByAP.get(ap.id) ?? null;
    if (!v) pendingCount++;
    return {
      apId: ap.id,
      apNumber: ap.apNumber,
      invoiceNumber: ap.invoiceNumber,
      invoiceDate: ap.invoiceDate.toISOString(),
      vendorName: ap.vendor.name,
      source: ap.grId ? "GR" : "DIRECT",
      creditAP: round2(ap.totalAmount),
      debitVat: round2(ap.vatAmount),
      debitExpense: round2(ap.amount),
      apStatus: ap.status,
      duplicate: ap.invoiceNumber?.trim() ? dupKeys.has(dupKey(ap.vendorId, ap.invoiceNumber)) : false,
      voucherId: v?.id ?? null,
      voucherNumber: v?.voucherNumber ?? null,
      voucherStatus: v?.status ?? null,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      creditAP: round2(t.creditAP + r.creditAP),
      debitVat: round2(t.debitVat + r.debitVat),
      debitExpense: round2(t.debitExpense + r.debitExpense),
    }),
    { creditAP: 0, debitVat: 0, debitExpense: 0 }
  );

  return { rows, totals, pendingCount, duplicateGroups, configMissing, from, to };
}

export type GeneratePurchaseVouchersResult = {
  created: number;
  skipped: number;
  errors: string[];
};

/**
 * สร้างใบสำคัญรายวัน (JournalVoucher) หนึ่งใบต่อใบตั้งหนี้ (AccountsPayable) หนึ่งใบ สำหรับใบตั้งหนี้
 * ในช่วงวันที่ที่เลือกที่ยังไม่มีใบสำคัญ (sourceType = "AP"). สร้างเป็นสถานะ DRAFT.
 *
 * ครอบคลุมทั้งสองทางที่ใบตั้งหนี้เกิดขึ้น: จากอัพโหลดใบกำกับภาษีซื้อ (CSV) และจากการคีย์รับสินค้า (GR).
 *
 * กันการซ้ำ 2 ชั้น (เหมือนสมุดรายวันขาย):
 *   1. กรองใบตั้งหนี้ที่มีใบสำคัญ "AP" อยู่แล้วออกก่อนสร้าง
 *   2. @@unique([sourceType, sourceId]) บน JournalVoucher — ชน P2002 นับเป็น skip
 * ส่วนกรณีบันทึกซ้ำจากทั้ง CSV และ GR (คนละใบตั้งหนี้ เลขที่ใบกำกับเดียวกัน) หน้าจอจะเตือน แต่ยังสร้างให้.
 *
 * คู่บัญชีต่อใบ (ตรงกับ lib/ledger.ts step 6):
 *   Cr เจ้าหนี้การค้า (ap) = totalAmount
 *   Dr ภาษีซื้อ (vat_input) = vatAmount (ข้ามถ้าเป็น 0)
 *   Dr ค่าใช้จ่าย/สินค้า = amount — ปันตามสัดส่วนมูลค่ารายการรับสินค้า (product.accountId) ถ้ามีสาย GR,
 *     ไม่งั้นใช้ accountId ที่ตั้งไว้บนใบตั้งหนี้ ไม่งั้นตกเข้าบัญชีพัก (ap_suspense). เศษปัดเศษดันเข้าบรรทัดสุดท้าย.
 */
export async function generatePurchaseVouchers(params: {
  from: string;
  to: string;
}): Promise<GeneratePurchaseVouchersResult> {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [config, chartAccounts] = await Promise.all([
    prisma.accountingConfig.findMany({ where: { key: { in: [...REQUIRED_CONFIG_KEYS] } } }),
    prisma.chartOfAccount.findMany({ select: { id: true } }),
  ]);
  const cfg = new Map(config.map((c) => [c.key, c.accountId]));
  const apId = cfg.get("ap") || null;
  const vatInputId = cfg.get("vat_input") || null;
  const suspenseId = cfg.get("ap_suspense") || null;
  const missing = REQUIRED_CONFIG_KEYS.filter((k) => !cfg.get(k));
  if (missing.length > 0) {
    throw new Error(
      `ยังไม่ได้ตั้งค่าผังบัญชีคุมยอด: ${missing.join(", ")} — กรุณาตั้งค่าที่หน้า "ตั้งค่าผังบัญชีคุมยอด" ก่อนสร้าง Voucher`
    );
  }

  const validAccountIds = new Set(chartAccounts.map((a) => a.id));
  // ผังบัญชีบนสินค้า/ใบตั้งหนี้ที่ถูกลบไปแล้ว — ปันเข้าบัญชีพักแทนเพื่อไม่ให้ชน FK
  const safeAcc = (id: string | null | undefined) => (id && validAccountIds.has(id) ? id : suspenseId!);

  const aps = await prisma.accountsPayable.findMany({
    where: { status: { not: "CANCELLED" }, invoiceDate: { gte: fromDate, lte: toDate } },
    select: {
      id: true,
      apNumber: true,
      invoiceNumber: true,
      invoiceDate: true,
      amount: true,
      vatAmount: true,
      totalAmount: true,
      vendor: { select: { name: true } },
      account: { select: { id: true } },
      gr: {
        select: {
          items: {
            select: {
              totalPrice: true,
              poItem: { select: { product: { select: { accountId: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ invoiceDate: "asc" }, { apNumber: "asc" }],
  });
  if (aps.length === 0) return { created: 0, skipped: 0, errors: [] };

  const existing = await prisma.journalVoucher.findMany({
    where: { sourceType: "AP", sourceId: { in: aps.map((a) => a.id) } },
    select: { sourceId: true },
  });
  const done = new Set(existing.map((e) => e.sourceId));
  const todo = aps.filter((a) => !done.has(a.id));
  if (todo.length === 0) return { created: 0, skipped: done.size, errors: [] };

  const nextVoucherNumber = voucherNumberSequencer();

  let created = 0;
  let skipped = done.size;
  const errors: string[] = [];
  const voucherRecords: JournalVoucherRecord[] = [];
  const lineRecords: JournalVoucherLineRecord[] = [];

  for (const ap of todo) {
    const totalAmount = round2(ap.totalAmount);
    const amount = round2(ap.amount);
    const vat = round2(ap.vatAmount);

    if (totalAmount === 0) {
      errors.push(`${ap.apNumber} (${ap.invoiceNumber}): ยอดรวมเป็น 0 — ข้าม`);
      continue;
    }

    const lines: { accountId: string; debit: number; credit: number }[] = [
      { accountId: apId!, debit: 0, credit: totalAmount },
    ];
    if (vat !== 0) lines.push({ accountId: vatInputId!, debit: vat, credit: 0 });

    // ปันส่วนขาเดบิตค่าใช้จ่าย/สินค้า
    const expenseByAcc = new Map<string, number>();
    const addExpense = (acc: string, amt: number) =>
      expenseByAcc.set(acc, (expenseByAcc.get(acc) ?? 0) + amt);
    const items = ap.gr?.items ?? [];
    const itemsSum = items.reduce((s, it) => s + it.totalPrice, 0);
    if (items.length === 0 || itemsSum <= 0) {
      addExpense(safeAcc(ap.account?.id), amount);
    } else {
      for (const it of items) {
        addExpense(safeAcc(it.poItem.product?.accountId ?? ap.account?.id), (it.totalPrice / itemsSum) * amount);
      }
    }

    const expEntries = [...expenseByAcc.entries()].map(([acc, amt]) => ({ acc, amt: round2(amt) }));
    const assigned = round2(expEntries.reduce((s, e) => s + e.amt, 0));
    const residual = round2(amount - assigned);
    if (residual !== 0 && expEntries.length > 0) {
      const last = expEntries[expEntries.length - 1];
      last.amt = round2(last.amt + residual);
    }

    let badLine = false;
    for (const e of expEntries) {
      if (e.amt === 0) continue;
      if (e.amt < 0) {
        badLine = true;
        break;
      }
      lines.push({ accountId: e.acc, debit: e.amt, credit: 0 });
    }
    if (badLine) {
      errors.push(`${ap.apNumber} (${ap.invoiceNumber}): มูลค่ารายการติดลบ ตรวจสอบข้อมูลรับสินค้า — ข้าม`);
      continue;
    }

    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (lines.length < 2 || Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
      errors.push(
        `${ap.apNumber} (${ap.invoiceNumber}): เดบิต (${totalDebit.toLocaleString()}) ≠ เครดิต (${totalCredit.toLocaleString()}) — ข้าม`
      );
      continue;
    }

    try {
      const voucherNumber = await nextVoucherNumber(ap.invoiceDate);
      const voucher = await prisma.journalVoucher.create({
        data: {
          voucherNumber,
          voucherDate: ap.invoiceDate,
          description: `ซื้อ — ${ap.vendor.name} (${ap.invoiceNumber})`,
          notes: "สร้างอัตโนมัติจากใบตั้งหนี้ (สมุดรายวันซื้อ)",
          status: "DRAFT",
          totalDebit,
          totalCredit,
          sourceType: "AP",
          sourceId: ap.id,
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
      voucherRecords.push(toVoucherRecord(voucher));
      lineRecords.push(...toLineRecords(voucher));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped++;
      } else {
        errors.push(`${ap.apNumber} (${ap.invoiceNumber}): สร้างไม่สำเร็จ`);
      }
    }
  }

  await syncGeneratedVouchersToSheet(voucherRecords, lineRecords);

  revalidatePath("/purchase-journal");
  revalidatePath("/journal-vouchers");
  return { created, skipped, errors };
}
