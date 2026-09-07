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

type PaymentRow = {
  id: string;
  paymentNumber: string;
  paymentDate: Date;
  amount: number;
  companyBankAccountId: string;
  referenceNumber: string | null;
  companyBankAccount: { bankName: string; accountNo: string };
  prep: {
    totalWithholdingTax: number | null;
    items: { ap: { vendor: { name: string } } }[];
  };
};

type Resolver = ReturnType<typeof configResolver>;

// สร้างบรรทัดคู่บัญชีของการจ่ายเงินหนึ่งรายการ + ผังบัญชีคุมยอดที่ยังขาด (ดู lib/ledger.ts step 5)
function buildPaymentLines(p: PaymentRow, res: Resolver) {
  const amount = round2(p.amount);
  const wht = round2(p.prep.totalWithholdingTax ?? 0);
  const bankLabel = `${p.companyBankAccount.bankName} ${p.companyBankAccount.accountNo}`;
  const bankAcc = res.bank(p.companyBankAccountId);

  const candidates: { accountId: string | null; debit: number; credit: number; missKey: string }[] = [];
  const apGross = round2(amount + wht);
  if (apGross !== 0) candidates.push({ accountId: res.get("ap"), debit: apGross, credit: 0, missKey: "ap" });
  if (wht !== 0) candidates.push({ accountId: res.get("wht_payable"), debit: 0, credit: wht, missKey: "wht_payable" });
  if (amount !== 0) candidates.push({ accountId: bankAcc, debit: 0, credit: amount, missKey: `เงินฝากธนาคาร: ${bankLabel}` });

  const missing = candidates.filter((c) => c.accountId === null).map((c) => c.missKey);
  const lines = candidates
    .filter((c) => c.debit !== 0 || c.credit !== 0)
    .map((c) => ({ accountId: c.accountId, debit: c.debit, credit: c.credit }));

  return { amount, wht, apGross, lines, missing };
}

export type PaymentsJournalRow = {
  paymentId: string;
  paymentNumber: string;
  paymentDate: string;
  vendorName: string;
  debitAP: number;
  creditWht: number;
  creditBank: number;
  duplicate: boolean;
  voucherId: string | null;
  voucherNumber: string | null;
  voucherStatus: string | null;
};

export type PaymentsJournalView = {
  rows: PaymentsJournalRow[];
  totals: { debitAP: number; creditWht: number; creditBank: number };
  pendingCount: number;
  duplicateGroups: { key: string; label: string; paymentNumbers: string[] }[];
  configMissing: string[];
  from: string;
  to: string;
};

export async function getPaymentsJournal(params: {
  from: string;
  to: string;
}): Promise<PaymentsJournalView> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [payments, vouchers, config] = await Promise.all([
    prisma.payment.findMany({
      where: { paymentDate: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        companyBankAccountId: true,
        referenceNumber: true,
        companyBankAccount: { select: { bankName: true, accountNo: true } },
        prep: {
          select: {
            totalWithholdingTax: true,
            items: { select: { ap: { select: { vendor: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: [{ paymentDate: "asc" }, { paymentNumber: "asc" }],
    }),
    prisma.journalVoucher.findMany({
      where: { sourceType: "PAY" },
      select: { id: true, voucherNumber: true, status: true, sourceId: true },
    }),
    prisma.accountingConfig.findMany(),
  ]);

  const res = configResolver(config);
  const voucherByPayment = new Map(vouchers.map((v) => [v.sourceId ?? "", v]));

  const byDup = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!p.referenceNumber?.trim()) continue;
    const k = dupKey(p.companyBankAccountId, p.referenceNumber, p.amount);
    const arr = byDup.get(k) ?? [];
    arr.push(p);
    byDup.set(k, arr);
  }
  const dupKeys = new Set([...byDup.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
  const duplicateGroups = [...byDup.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({
      key,
      label: `${v[0].companyBankAccount.bankName} ${v[0].companyBankAccount.accountNo} · อ้างอิง ${v[0].referenceNumber} · ฿${round2(v[0].amount).toLocaleString()}`,
      paymentNumbers: v.map((x) => x.paymentNumber),
    }));

  const configMissingSet = new Set<string>();
  let pendingCount = 0;
  const rows: PaymentsJournalRow[] = payments.map((p) => {
    const b = buildPaymentLines(p, res);
    b.missing.forEach((m) => configMissingSet.add(m));
    const v = voucherByPayment.get(p.id) ?? null;
    if (!v) pendingCount++;
    return {
      paymentId: p.id,
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate.toISOString(),
      vendorName: nameList(p.prep.items.map((i) => i.ap.vendor.name)),
      debitAP: b.apGross,
      creditWht: b.wht,
      creditBank: b.amount,
      duplicate: p.referenceNumber?.trim()
        ? dupKeys.has(dupKey(p.companyBankAccountId, p.referenceNumber, p.amount))
        : false,
      voucherId: v?.id ?? null,
      voucherNumber: v?.voucherNumber ?? null,
      voucherStatus: v?.status ?? null,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      debitAP: round2(t.debitAP + r.debitAP),
      creditWht: round2(t.creditWht + r.creditWht),
      creditBank: round2(t.creditBank + r.creditBank),
    }),
    { debitAP: 0, creditWht: 0, creditBank: 0 }
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

export type GeneratePaymentVouchersResult = { created: number; skipped: number; errors: string[] };

/**
 * สร้างใบสำคัญรายวันหนึ่งใบต่อการจ่ายเงินหนึ่งรายการ (sourceType = "PAY") สถานะ DRAFT.
 * คู่บัญชีตรงกับ lib/ledger.ts step 5: Dr เจ้าหนี้การค้า (ยอดจ่าย + ภาษีหัก ณ ที่จ่าย),
 * Cr ภาษีหัก ณ ที่จ่ายค้างนำส่ง, Cr เงินฝากธนาคาร.
 * กันซ้ำ 2 ชั้น: กรองใบที่มีใบสำคัญอยู่แล้ว + @@unique([sourceType, sourceId]) (P2002 → skip).
 */
export async function generatePaymentVouchers(params: {
  from: string;
  to: string;
}): Promise<GeneratePaymentVouchersResult> {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [config, payments] = await Promise.all([
    prisma.accountingConfig.findMany(),
    prisma.payment.findMany({
      where: { paymentDate: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        companyBankAccountId: true,
        referenceNumber: true,
        companyBankAccount: { select: { bankName: true, accountNo: true } },
        prep: {
          select: {
            totalWithholdingTax: true,
            items: { select: { ap: { select: { vendor: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: [{ paymentDate: "asc" }, { paymentNumber: "asc" }],
    }),
  ]);
  if (payments.length === 0) return { created: 0, skipped: 0, errors: [] };

  const res = configResolver(config);

  const existing = await prisma.journalVoucher.findMany({
    where: { sourceType: "PAY", sourceId: { in: payments.map((p) => p.id) } },
    select: { sourceId: true },
  });
  const done = new Set(existing.map((e) => e.sourceId));
  const todo = payments.filter((p) => !done.has(p.id));
  if (todo.length === 0) return { created: 0, skipped: done.size, errors: [] };

  const nextVoucherNumber = voucherNumberSequencer();

  let created = 0;
  let skipped = done.size;
  const errors: string[] = [];
  const voucherRecords: JournalVoucherRecord[] = [];
  const lineRecords: JournalVoucherLineRecord[] = [];

  for (const p of todo) {
    const b = buildPaymentLines(p, res);
    if (b.missing.length > 0) {
      errors.push(`${p.paymentNumber}: ยังไม่ได้ตั้งค่าผังบัญชี — ${[...new Set(b.missing)].join(", ")}`);
      continue;
    }
    const lines = b.lines as { accountId: string; debit: number; credit: number }[];
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (lines.length < 2 || Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
      errors.push(
        `${p.paymentNumber}: เดบิต (${totalDebit.toLocaleString()}) ≠ เครดิต (${totalCredit.toLocaleString()}) — ข้าม`
      );
      continue;
    }

    try {
      const voucherNumber = await nextVoucherNumber(p.paymentDate);
      const voucher = await prisma.journalVoucher.create({
        data: {
          voucherNumber,
          voucherDate: p.paymentDate,
          description: `จ่ายเงิน — ${nameList(p.prep.items.map((i) => i.ap.vendor.name))} (${p.paymentNumber})`,
          notes: "สร้างอัตโนมัติจากการจ่ายเงิน (สมุดรายวันจ่ายเงิน)",
          status: "DRAFT",
          totalDebit,
          totalCredit,
          sourceType: "PAY",
          sourceId: p.id,
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
      else errors.push(`${p.paymentNumber}: สร้างไม่สำเร็จ`);
    }
  }

  await syncGeneratedVouchersToSheet(voucherRecords, lineRecords);

  revalidatePath("/payments-journal");
  revalidatePath("/journal-vouchers");
  return { created, skipped, errors };
}
