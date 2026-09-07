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
  configResolver,
} from "@/lib/auto-voucher";
import { JournalVoucherRecord, JournalVoucherLineRecord } from "@/lib/sheets-tables";

const nameList = (names: string[]) => [...new Set(names.filter(Boolean))].join(", ") || "-";
const dupKey = (bankId: string, ref: string, amount: number) =>
  `${bankId}::${ref.trim().toLowerCase()}::${round2(amount)}`;

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  receiptDate: Date;
  companyBankAccountId: string;
  referenceNumber: string | null;
  feeAmount: number;
  withholdingTaxAmount: number;
  actualReceivedAmount: number;
  companyBankAccount: { bankName: string; accountNo: string };
  items: { amount: number; invoice: { customer: { name: string } } }[];
};

type Resolver = ReturnType<typeof configResolver>;

// สร้างบรรทัดคู่บัญชีของใบรับชำระหนึ่งใบ + รายชื่อผังบัญชีคุมยอดที่ยังขาด (ดู lib/ledger.ts step 4)
function buildReceiptLines(r: ReceiptRow, res: Resolver) {
  const arTotal = round2(r.items.reduce((s, i) => s + i.amount, 0));
  const recv = round2(r.actualReceivedAmount);
  const fee = round2(r.feeAmount);
  const wht = round2(r.withholdingTaxAmount);

  const bankLabel = `${r.companyBankAccount.bankName} ${r.companyBankAccount.accountNo}`;
  const bankAcc = res.bank(r.companyBankAccountId);

  const candidates: { accountId: string | null; debit: number; credit: number; missKey: string }[] = [];
  if (recv !== 0) candidates.push({ accountId: bankAcc, debit: recv, credit: 0, missKey: `เงินฝากธนาคาร: ${bankLabel}` });
  if (fee !== 0) candidates.push({ accountId: res.get("bank_fee"), debit: fee, credit: 0, missKey: "bank_fee" });
  if (wht !== 0) candidates.push({ accountId: res.get("wht_receivable"), debit: wht, credit: 0, missKey: "wht_receivable" });
  if (arTotal !== 0) candidates.push({ accountId: res.get("ar"), debit: 0, credit: arTotal, missKey: "ar" });

  const totalDebit = round2(candidates.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(candidates.reduce((s, l) => s + l.credit, 0));
  const diff = round2(totalDebit - totalCredit); // >0 = รับเกิน, <0 = รับขาด
  if (diff < 0) candidates.push({ accountId: res.get("receipt_variance"), debit: round2(-diff), credit: 0, missKey: "receipt_variance" });
  else if (diff > 0) candidates.push({ accountId: res.get("receipt_variance"), debit: 0, credit: diff, missKey: "receipt_variance" });

  const missing = candidates.filter((c) => c.accountId === null).map((c) => c.missKey);
  const lines = candidates
    .filter((c) => c.debit !== 0 || c.credit !== 0)
    .map((c) => ({ accountId: c.accountId, debit: c.debit, credit: c.credit }));

  return { arTotal, recv, fee, wht, variance: diff, lines, missing };
}

export type ReceiptsJournalRow = {
  receiptId: string;
  receiptNumber: string;
  receiptDate: string;
  customerName: string;
  debitBank: number;
  debitFee: number;
  debitWht: number;
  creditAR: number;
  variance: number; // >0 รับเกิน (Cr ผลต่าง), <0 รับขาด (Dr ผลต่าง)
  duplicate: boolean;
  voucherId: string | null;
  voucherNumber: string | null;
  voucherStatus: string | null;
};

export type ReceiptsJournalView = {
  rows: ReceiptsJournalRow[];
  totals: { debitBank: number; debitFee: number; debitWht: number; creditAR: number };
  pendingCount: number;
  duplicateGroups: { key: string; label: string; receiptNumbers: string[] }[];
  configMissing: string[];
  from: string;
  to: string;
};

export async function getReceiptsJournal(params: {
  from: string;
  to: string;
}): Promise<ReceiptsJournalView> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [receipts, vouchers, config] = await Promise.all([
    prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" }, receiptDate: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        companyBankAccountId: true,
        referenceNumber: true,
        feeAmount: true,
        withholdingTaxAmount: true,
        actualReceivedAmount: true,
        companyBankAccount: { select: { bankName: true, accountNo: true } },
        items: { select: { amount: true, invoice: { select: { customer: { select: { name: true } } } } } },
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
    }),
    prisma.journalVoucher.findMany({
      where: { sourceType: "RC" },
      select: { id: true, voucherNumber: true, status: true, sourceId: true },
    }),
    prisma.accountingConfig.findMany(),
  ]);

  const res = configResolver(config);
  const voucherByReceipt = new Map(vouchers.map((v) => [v.sourceId ?? "", v]));

  // ตรวจซ้ำ: บัญชีธนาคาร + เลขที่อ้างอิง + ยอดที่ได้รับจริง ตรงกัน (เลขที่อ้างอิงต้องไม่ว่าง)
  const byDup = new Map<string, ReceiptRow[]>();
  for (const r of receipts) {
    if (!r.referenceNumber?.trim()) continue;
    const k = dupKey(r.companyBankAccountId, r.referenceNumber, r.actualReceivedAmount);
    const arr = byDup.get(k) ?? [];
    arr.push(r);
    byDup.set(k, arr);
  }
  const dupKeys = new Set([...byDup.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
  const duplicateGroups = [...byDup.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({
      key,
      label: `${v[0].companyBankAccount.bankName} ${v[0].companyBankAccount.accountNo} · อ้างอิง ${v[0].referenceNumber} · ฿${round2(v[0].actualReceivedAmount).toLocaleString()}`,
      receiptNumbers: v.map((x) => x.receiptNumber),
    }));

  const configMissingSet = new Set<string>();
  let pendingCount = 0;
  const rows: ReceiptsJournalRow[] = receipts.map((r) => {
    const b = buildReceiptLines(r, res);
    b.missing.forEach((m) => configMissingSet.add(m));
    const v = voucherByReceipt.get(r.id) ?? null;
    if (!v) pendingCount++;
    return {
      receiptId: r.id,
      receiptNumber: r.receiptNumber,
      receiptDate: r.receiptDate.toISOString(),
      customerName: nameList(r.items.map((i) => i.invoice.customer.name)),
      debitBank: b.recv,
      debitFee: b.fee,
      debitWht: b.wht,
      creditAR: b.arTotal,
      variance: b.variance,
      duplicate: r.referenceNumber?.trim()
        ? dupKeys.has(dupKey(r.companyBankAccountId, r.referenceNumber, r.actualReceivedAmount))
        : false,
      voucherId: v?.id ?? null,
      voucherNumber: v?.voucherNumber ?? null,
      voucherStatus: v?.status ?? null,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      debitBank: round2(t.debitBank + r.debitBank),
      debitFee: round2(t.debitFee + r.debitFee),
      debitWht: round2(t.debitWht + r.debitWht),
      creditAR: round2(t.creditAR + r.creditAR),
    }),
    { debitBank: 0, debitFee: 0, debitWht: 0, creditAR: 0 }
  );

  return {
    rows,
    totals,
    pendingCount,
    duplicateGroups,
    configMissing: [...configMissingSet],
    from,
    to,
  };
}

export type GenerateReceiptVouchersResult = { created: number; skipped: number; errors: string[] };

/**
 * สร้างใบสำคัญรายวันหนึ่งใบต่อใบรับชำระหนึ่งใบ (sourceType = "RC") สถานะ DRAFT.
 * คู่บัญชีตรงกับ lib/ledger.ts step 4: Dr เงินฝากธนาคาร + Dr ค่าธรรมเนียม + Dr ภาษีถูกหัก ณ ที่จ่าย,
 * Cr ลูกหนี้การค้า, ผลต่างเงินขาด/เกิน → บัญชีผลต่างรับชำระ.
 * กันซ้ำ 2 ชั้น: กรองใบที่มีใบสำคัญอยู่แล้ว + @@unique([sourceType, sourceId]) (P2002 → skip).
 */
export async function generateReceiptVouchers(params: {
  from: string;
  to: string;
}): Promise<GenerateReceiptVouchersResult> {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [config, receipts] = await Promise.all([
    prisma.accountingConfig.findMany(),
    prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" }, receiptDate: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        companyBankAccountId: true,
        referenceNumber: true,
        feeAmount: true,
        withholdingTaxAmount: true,
        actualReceivedAmount: true,
        companyBankAccount: { select: { bankName: true, accountNo: true } },
        items: { select: { amount: true, invoice: { select: { customer: { select: { name: true } } } } } },
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
    }),
  ]);
  if (receipts.length === 0) return { created: 0, skipped: 0, errors: [] };

  const res = configResolver(config);

  const existing = await prisma.journalVoucher.findMany({
    where: { sourceType: "RC", sourceId: { in: receipts.map((r) => r.id) } },
    select: { sourceId: true },
  });
  const done = new Set(existing.map((e) => e.sourceId));
  const todo = receipts.filter((r) => !done.has(r.id));
  if (todo.length === 0) return { created: 0, skipped: done.size, errors: [] };

  const nextVoucherNumber = voucherNumberSequencer();

  let created = 0;
  let skipped = done.size;
  const errors: string[] = [];
  const voucherRecords: JournalVoucherRecord[] = [];
  const lineRecords: JournalVoucherLineRecord[] = [];

  for (const r of todo) {
    const b = buildReceiptLines(r, res);
    if (b.missing.length > 0) {
      errors.push(`${r.receiptNumber}: ยังไม่ได้ตั้งค่าผังบัญชี — ${[...new Set(b.missing)].join(", ")}`);
      continue;
    }
    const lines = b.lines as { accountId: string; debit: number; credit: number }[];
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (lines.length < 2 || Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
      errors.push(
        `${r.receiptNumber}: เดบิต (${totalDebit.toLocaleString()}) ≠ เครดิต (${totalCredit.toLocaleString()}) — ข้าม`
      );
      continue;
    }

    try {
      const voucherNumber = await nextVoucherNumber(r.receiptDate);
      const voucher = await prisma.journalVoucher.create({
        data: {
          voucherNumber,
          voucherDate: r.receiptDate,
          description: `รับชำระ — ${nameList(r.items.map((i) => i.invoice.customer.name))} (${r.receiptNumber})`,
          notes: "สร้างอัตโนมัติจากใบรับชำระ (สมุดรายวันรับเงิน)",
          status: "DRAFT",
          totalDebit,
          totalCredit,
          sourceType: "RC",
          sourceId: r.id,
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") skipped++;
      else errors.push(`${r.receiptNumber}: สร้างไม่สำเร็จ`);
    }
  }

  await syncGeneratedVouchersToSheet(voucherRecords, lineRecords);

  revalidatePath("/receipts-journal");
  revalidatePath("/journal-vouchers");
  return { created, skipped, errors };
}
