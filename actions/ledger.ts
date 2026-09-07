"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { accountingConfigTable, AccountingConfigRecord } from "@/lib/sheets-tables";
import {
  RawLedgerEntry,
  DocEntries,
  ConfigKey,
  CONFIG_KEYS,
  CONFIG_KEY_META,
  bankConfigKey,
  round2,
  isUnsetAccountId,
  unsetKeyOf,
  LedgerSourceType,
  SOURCE_TYPE_LABEL,
  sourceHref,
} from "@/lib/ledger";

// ─────────────────────────────────────────────────────────────────────────────
// การตั้งค่าผังบัญชีคุมยอด (AccountingConfig)
// ─────────────────────────────────────────────────────────────────────────────

/** Same dual-write rationale as the other sync helpers in this codebase — see accounts-payable.ts. */
async function syncConfigRowsToSheet(rows: AccountingConfigRecord[]) {
  if (rows.length === 0) return;
  const existing = await accountingConfigTable.findMany();
  const existingIds = new Set(existing.map((r) => r.id));
  const toUpdate = rows.filter((r) => existingIds.has(r.id));
  const toCreate = rows.filter((r) => !existingIds.has(r.id));
  if (toUpdate.length > 0)
    await accountingConfigTable.updateMany(toUpdate.map((r) => ({ id: r.id, data: r })));
  if (toCreate.length > 0) await accountingConfigTable.createMany(toCreate);
}

export type AccountingConfigView = {
  accounts: { id: string; code: string; name: string; type: string; isActive: boolean }[];
  bankAccounts: { id: string; bankName: string; accountNo: string; accountName: string }[];
  values: Record<string, string | null>;
};

export async function getAccountingConfig(): Promise<AccountingConfigView> {
  const [rows, accounts, bankAccounts] = await Promise.all([
    prisma.accountingConfig.findMany(),
    prisma.chartOfAccount.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true, isActive: true },
    }),
    prisma.companyBankAccount.findMany({
      where: { isActive: true },
      orderBy: { bankName: "asc" },
      select: { id: true, bankName: true, accountNo: true, accountName: true },
    }),
  ]);

  const map = new Map(rows.map((r) => [r.key, r.accountId]));
  const values: Record<string, string | null> = {};
  for (const k of CONFIG_KEYS) values[k] = map.get(k) ?? null;
  for (const b of bankAccounts) {
    const k = bankConfigKey(b.id);
    values[k] = map.get(k) ?? null;
  }

  return { accounts, bankAccounts, values };
}

export async function saveAccountingConfig(entries: { key: string; accountId: string | null }[]) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER")
    throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่แก้ไขการตั้งค่าผังบัญชีคุมยอดได้");

  const saved: AccountingConfigRecord[] = [];
  for (const e of entries) {
    const row = await prisma.accountingConfig.upsert({
      where: { key: e.key },
      update: { accountId: e.accountId || null },
      create: { key: e.key, accountId: e.accountId || null },
    });
    saved.push({ id: row.id, key: row.key, accountId: row.accountId, updatedAt: row.updatedAt });
  }

  try {
    await syncConfigRowsToSheet(saved);
  } catch (err) {
    console.error("syncToSheet failed after saveAccountingConfig:", err);
  }

  revalidatePath("/accounting-config");
  revalidatePath("/general-ledger");
  revalidatePath("/trial-balance");
}

// ─────────────────────────────────────────────────────────────────────────────
// Posting engine — สังเคราะห์รายการเดบิต-เครดิตจากเอกสารต้นทาง
// ─────────────────────────────────────────────────────────────────────────────

type AccountMeta = { code: string; name: string; type: string; sortKey: string };

type BuiltLedger = {
  entries: RawLedgerEntry[];
  meta: Map<string, AccountMeta>;
  unsetKeys: string[]; // keys ของบัญชีคุมยอดที่ยังไม่ได้ตั้งค่าแต่มีรายการอ้างถึง
};

async function buildLedger(): Promise<BuiltLedger> {
  const [config, chart, banks, jvs, invoices, notes, receipts, payments, aps] = await Promise.all([
    prisma.accountingConfig.findMany(),
    prisma.chartOfAccount.findMany({ select: { id: true, code: true, name: true, type: true } }),
    prisma.companyBankAccount.findMany({ select: { id: true, bankName: true, accountNo: true } }),
    prisma.journalVoucher.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        voucherNumber: true,
        voucherDate: true,
        description: true,
        sourceType: true,
        sourceId: true,
        lines: { select: { accountId: true, debit: true, credit: true } },
      },
    }),
    prisma.salesInvoice.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        amount: true,
        discountAmount: true,
        vatAmount: true,
        totalAmount: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.debitCreditNote.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        noteNumber: true,
        noteDate: true,
        type: true,
        amount: true,
        vatAmount: true,
        totalAmount: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
    prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        companyBankAccountId: true,
        feeAmount: true,
        withholdingTaxAmount: true,
        actualReceivedAmount: true,
        items: { select: { amount: true, invoice: { select: { customer: { select: { name: true } } } } } },
      },
    }),
    prisma.payment.findMany({
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        companyBankAccountId: true,
        prep: {
          select: {
            totalWithholdingTax: true,
            items: { select: { ap: { select: { vendor: { select: { name: true } } } } } },
          },
        },
      },
    }),
    prisma.accountsPayable.findMany({
      where: { status: { not: "CANCELLED" } },
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
    }),
  ]);

  const cfg = new Map(config.map((c) => [c.key, c.accountId]));
  const resolve = (key: ConfigKey): string | null => cfg.get(key) ?? null;
  const resolveBank = (bankId: string): string | null =>
    cfg.get(bankConfigKey(bankId)) ?? cfg.get("bank_default") ?? null;

  const bankName = new Map(banks.map((b) => [b.id, `${b.bankName} ${b.accountNo}`]));
  const nameList = (names: string[]) => [...new Set(names.filter(Boolean))].join(", ") || "-";

  const out: RawLedgerEntry[] = [];

  // ใบกำกับภาษีขายที่มีใบสำคัญ "สมุดรายวันขาย" อนุมัติแล้ว — ข้ามการสังเคราะห์ในข้อ 2 เพื่อไม่ให้นับซ้ำ
  // (คู่บัญชีของใบกำกับเหล่านี้เข้าบัญชีแยกประเภทผ่านใบสำคัญในข้อ 1 แทน)
  const invoicesPostedViaVoucher = new Set(
    jvs.filter((v) => v.sourceType === "SI" && v.sourceId).map((v) => v.sourceId as string)
  );

  // 1) สมุดรายวันทั่วไป (เฉพาะอนุมัติแล้ว)
  for (const v of jvs) {
    const doc = new DocEntries({
      date: v.voucherDate,
      sourceType: "JV",
      sourceId: v.id,
      sourceNumber: v.voucherNumber,
      description: v.description,
    });
    for (const l of v.lines) {
      doc.debit(l.accountId, "imbalance", l.debit);
      doc.credit(l.accountId, "imbalance", l.credit);
    }
    out.push(...doc.balance(resolve("imbalance"), "imbalance"));
  }

  // 2) ใบกำกับภาษีขาย (ยกเว้นใบที่โพสต์ผ่านใบสำคัญสมุดรายวันขายที่อนุมัติแล้ว)
  for (const si of invoices) {
    if (invoicesPostedViaVoucher.has(si.id)) continue;
    const doc = new DocEntries({
      date: si.invoiceDate,
      sourceType: "SI",
      sourceId: si.id,
      sourceNumber: si.invoiceNumber,
      description: `ขาย — ${si.customer.name}`,
    });
    doc.debit(resolve("ar"), "ar", si.totalAmount);
    doc.credit(resolve("revenue"), "revenue", round2(si.amount - si.discountAmount));
    doc.credit(resolve("vat_output"), "vat_output", si.vatAmount);
    out.push(...doc.balance(resolve("imbalance"), "imbalance"));
  }

  // 3) ใบเพิ่ม/ลดหนี้ (อนุมัติแล้ว)
  for (const n of notes) {
    const doc = new DocEntries({
      date: n.noteDate,
      sourceType: "DCN",
      sourceId: n.id,
      sourceNumber: n.noteNumber,
      description: `${n.type === "DEBIT" ? "ใบเพิ่มหนี้" : "ใบลดหนี้"} — ${n.invoice.invoiceNumber}`,
    });
    if (n.type === "DEBIT") {
      doc.debit(resolve("ar"), "ar", n.totalAmount);
      doc.credit(resolve("revenue"), "revenue", n.amount);
      doc.credit(resolve("vat_output"), "vat_output", n.vatAmount);
    } else {
      doc.credit(resolve("ar"), "ar", n.totalAmount);
      doc.debit(resolve("revenue"), "revenue", n.amount);
      doc.debit(resolve("vat_output"), "vat_output", n.vatAmount);
    }
    out.push(...doc.balance(resolve("imbalance"), "imbalance"));
  }

  // 4) รับชำระ (Receipt) — ผลต่างเงินขาด/เกินดันลงบัญชีผลต่างรับชำระ
  for (const r of receipts) {
    const doc = new DocEntries({
      date: r.receiptDate,
      sourceType: "RC",
      sourceId: r.id,
      sourceNumber: r.receiptNumber,
      description: `รับชำระ — ${nameList(r.items.map((i) => i.invoice.customer.name))}`,
    });
    const arTotal = round2(r.items.reduce((s, i) => s + i.amount, 0));
    doc.debit(resolveBank(r.companyBankAccountId), bankConfigKey(r.companyBankAccountId), r.actualReceivedAmount);
    doc.debit(resolve("bank_fee"), "bank_fee", r.feeAmount);
    doc.debit(resolve("wht_receivable"), "wht_receivable", r.withholdingTaxAmount);
    doc.credit(resolve("ar"), "ar", arTotal);
    out.push(...doc.balance(resolve("receipt_variance"), "receipt_variance"));
  }

  // 5) จ่ายเงิน (Payment ผ่าน PaymentPrep)
  for (const p of payments) {
    const wht = round2(p.prep.totalWithholdingTax ?? 0);
    const doc = new DocEntries({
      date: p.paymentDate,
      sourceType: "PAY",
      sourceId: p.id,
      sourceNumber: p.paymentNumber,
      description: `จ่ายเงิน — ${nameList(p.prep.items.map((i) => i.ap.vendor.name))}`,
    });
    doc.debit(resolve("ap"), "ap", round2(p.amount + wht));
    doc.credit(resolve("wht_payable"), "wht_payable", wht);
    doc.credit(resolveBank(p.companyBankAccountId), bankConfigKey(p.companyBankAccountId), p.amount);
    out.push(...doc.balance(resolve("imbalance"), "imbalance"));
  }

  // 6) ตั้งหนี้ (AP) — แยกหมวดค่าใช้จ่ายแบบเดียวกับงบกำไรขาดทุน (getProfitLossReport)
  for (const ap of aps) {
    const doc = new DocEntries({
      date: ap.invoiceDate,
      sourceType: "AP",
      sourceId: ap.id,
      sourceNumber: ap.apNumber,
      description: `ตั้งหนี้ — ${ap.vendor.name} (${ap.invoiceNumber})`,
    });
    doc.credit(resolve("ap"), "ap", ap.totalAmount);
    doc.debit(resolve("vat_input"), "vat_input", ap.vatAmount);

    const items = ap.gr?.items ?? [];
    const itemsSum = items.reduce((s, it) => s + it.totalPrice, 0);
    if (items.length === 0 || itemsSum <= 0) {
      doc.debit(ap.account?.id ?? resolve("ap_suspense"), "ap_suspense", ap.amount);
    } else {
      for (const it of items) {
        const acc = it.poItem.product?.accountId ?? ap.account?.id ?? resolve("ap_suspense");
        doc.debit(acc, "ap_suspense", round2((it.totalPrice / itemsSum) * ap.amount));
      }
    }
    out.push(...doc.balance(resolve("ap_suspense"), "ap_suspense"));
  }

  // ─── ผูกชื่อบัญชี + เก็บ key ที่ยังไม่ได้ตั้งค่า ───
  const chartMeta = new Map(
    chart.map((a) => [a.id, { code: a.code, name: a.name, type: a.type, sortKey: a.code }])
  );
  const meta = new Map<string, AccountMeta>(chartMeta);
  const unsetKeys = new Set<string>();

  for (const e of out) {
    if (meta.has(e.accountId)) continue;
    if (isUnsetAccountId(e.accountId)) {
      const key = unsetKeyOf(e.accountId);
      unsetKeys.add(key);
      if (!meta.has(e.accountId)) {
        let label: string;
        if (key.startsWith("bank:")) {
          const bid = key.slice("bank:".length);
          label = `เงินฝากธนาคาร: ${bankName.get(bid) ?? bid}`;
        } else {
          label = CONFIG_KEY_META[key as ConfigKey]?.label ?? key;
        }
        meta.set(e.accountId, {
          code: "—",
          name: `(ยังไม่ได้ตั้งค่า) ${label}`,
          type: "UNSET",
          sortKey: "zzzz~" + key,
        });
      }
    } else {
      // accountId ที่หาไม่เจอในผังบัญชี (ผังบัญชีถูกลบ ฯลฯ) — กันพัง
      meta.set(e.accountId, { code: "?", name: "(บัญชีถูกลบ)", type: "UNKNOWN", sortKey: "zzzz~~" });
    }
  }

  return { entries: out, meta, unsetKeys: [...unsetKeys] };
}

// ─────────────────────────────────────────────────────────────────────────────
// บัญชีแยกประเภท (General Ledger)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLedgerAccounts() {
  return prisma.chartOfAccount.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export type GeneralLedgerEntry = {
  date: string;
  sourceType: LedgerSourceType;
  sourceTypeLabel: string;
  sourceNumber: string;
  description: string;
  href: string;
  debit: number;
  credit: number;
  balance: number;
};

export type GeneralLedgerBlock = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  opening: number;
  totalDebit: number;
  totalCredit: number;
  closing: number;
  entries: GeneralLedgerEntry[];
};

export type GeneralLedgerResult = {
  blocks: GeneralLedgerBlock[];
  unsetKeys: string[];
  from: string;
  to: string;
};

const SOURCE_ORDER: Record<LedgerSourceType, number> = { AP: 0, SI: 1, DCN: 2, PAY: 3, RC: 4, JV: 5 };

export async function getGeneralLedger(params: {
  accountId: string;
  from: string;
  to: string;
}): Promise<GeneralLedgerResult> {
  const { accountId, from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const { entries, meta, unsetKeys } = await buildLedger();

  const relevant = accountId === "ALL" ? entries : entries.filter((e) => e.accountId === accountId);

  const byAccount = new Map<string, RawLedgerEntry[]>();
  for (const e of relevant) {
    const arr = byAccount.get(e.accountId) ?? [];
    arr.push(e);
    byAccount.set(e.accountId, arr);
  }

  const blocks: GeneralLedgerBlock[] = [];
  for (const [accId, list] of byAccount) {
    const m = meta.get(accId) ?? { code: "?", name: "(ไม่ทราบบัญชี)", type: "UNKNOWN", sortKey: "zzzz" };

    const opening = round2(
      list
        .filter((e) => e.date < fromDate)
        .reduce((s, e) => s + e.debit - e.credit, 0)
    );

    const period = list
      .filter((e) => e.date >= fromDate && e.date <= toDate)
      .sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() ||
          SOURCE_ORDER[a.sourceType] - SOURCE_ORDER[b.sourceType] ||
          a.sourceNumber.localeCompare(b.sourceNumber)
      );

    let running = opening;
    const glEntries: GeneralLedgerEntry[] = period.map((e) => {
      running = round2(running + e.debit - e.credit);
      return {
        date: e.date.toISOString(),
        sourceType: e.sourceType,
        sourceTypeLabel: SOURCE_TYPE_LABEL[e.sourceType],
        sourceNumber: e.sourceNumber,
        description: e.description,
        href: sourceHref(e.sourceType, e.sourceId),
        debit: e.debit,
        credit: e.credit,
        balance: running,
      };
    });

    const totalDebit = round2(period.reduce((s, e) => s + e.debit, 0));
    const totalCredit = round2(period.reduce((s, e) => s + e.credit, 0));

    blocks.push({
      accountId: accId,
      code: m.code,
      name: m.name,
      type: m.type,
      opening,
      totalDebit,
      totalCredit,
      closing: round2(opening + totalDebit - totalCredit),
      entries: glEntries,
    });
  }

  blocks.sort((a, b) => {
    const ma = meta.get(a.accountId)?.sortKey ?? a.code;
    const mb = meta.get(b.accountId)?.sortKey ?? b.code;
    return ma.localeCompare(mb, undefined, { numeric: true });
  });

  return { blocks, unsetKeys, from, to };
}

// ─────────────────────────────────────────────────────────────────────────────
// งบทดลอง (Trial Balance)
// ─────────────────────────────────────────────────────────────────────────────

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type TrialBalanceResult = {
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
  balanced: boolean;
  unsetKeys: string[];
  from: string;
  to: string;
};

const splitDr = (net: number) => (net >= 0 ? round2(net) : 0);
const splitCr = (net: number) => (net < 0 ? round2(-net) : 0);

export async function getTrialBalance(params: { from: string; to: string }): Promise<TrialBalanceResult> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const { entries, meta, unsetKeys } = await buildLedger();

  const byAccount = new Map<string, RawLedgerEntry[]>();
  for (const e of entries) {
    const arr = byAccount.get(e.accountId) ?? [];
    arr.push(e);
    byAccount.set(e.accountId, arr);
  }

  const rows: TrialBalanceRow[] = [];
  for (const [accId, list] of byAccount) {
    const m = meta.get(accId) ?? { code: "?", name: "(ไม่ทราบบัญชี)", type: "UNKNOWN", sortKey: "zzzz" };

    const openingNet = list
      .filter((e) => e.date < fromDate)
      .reduce((s, e) => s + e.debit - e.credit, 0);
    const periodDebit = round2(
      list.filter((e) => e.date >= fromDate && e.date <= toDate).reduce((s, e) => s + e.debit, 0)
    );
    const periodCredit = round2(
      list.filter((e) => e.date >= fromDate && e.date <= toDate).reduce((s, e) => s + e.credit, 0)
    );
    const closingNet = openingNet + periodDebit - periodCredit;

    if (
      Math.abs(openingNet) < 0.005 &&
      periodDebit === 0 &&
      periodCredit === 0 &&
      Math.abs(closingNet) < 0.005
    )
      continue;

    rows.push({
      accountId: accId,
      code: m.code,
      name: m.name,
      type: m.type,
      openingDebit: splitDr(openingNet),
      openingCredit: splitCr(openingNet),
      periodDebit,
      periodCredit,
      closingDebit: splitDr(closingNet),
      closingCredit: splitCr(closingNet),
    });
  }

  rows.sort((a, b) => {
    const ma = meta.get(a.accountId)?.sortKey ?? a.code;
    const mb = meta.get(b.accountId)?.sortKey ?? b.code;
    return ma.localeCompare(mb, undefined, { numeric: true });
  });

  const totals = rows.reduce(
    (t, r) => ({
      openingDebit: round2(t.openingDebit + r.openingDebit),
      openingCredit: round2(t.openingCredit + r.openingCredit),
      periodDebit: round2(t.periodDebit + r.periodDebit),
      periodCredit: round2(t.periodCredit + r.periodCredit),
      closingDebit: round2(t.closingDebit + r.closingDebit),
      closingCredit: round2(t.closingCredit + r.closingCredit),
    }),
    { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 }
  );

  const balanced =
    Math.abs(totals.periodDebit - totals.periodCredit) < 0.01 &&
    Math.abs(totals.closingDebit - totals.closingCredit) < 0.01;

  return { rows, totals, balanced, unsetKeys, from, to };
}

// ─────────────────────────────────────────────────────────────────────────────
// งบกำไรขาดทุน (Profit & Loss) — ดึงตัวเลขจาก ledger ชุดเดียวกับงบทดลอง
// ─────────────────────────────────────────────────────────────────────────────
//
// รายได้/ค่าใช้จ่ายมาจาก buildLedger() โดยตรง (บัญชีประเภท REVENUE / EXPENSE) จึง "ดุล" กับงบทดลอง
// เสมอ — เคลื่อนไหวช่วงเวลาของบัญชี REVENUE = เครดิต − เดบิต, ของ EXPENSE = เดบิต − เครดิต.
//
// ส่วนที่ยัง "ไม่ได้ลงบัญชีแยกประเภท" จะแยกออกมาเป็นรายการปรับปรุงต่างหาก ไม่ปนกับตัวเลข ledger:
//   • ค่าใช้จ่ายเงินเดือน/แรงงานจากโมดูล "ทำต้นทุนเพิ่ม" (MonthlyPayrollExpense) — รายเดือน
//   • การเปลี่ยนแปลงสินค้าคงเหลือ (InventorySnapshot) — จัดการฝั่งหน้าจอ
// หน้า /reports/profit-loss เป็นผู้รวมยอดปรับปรุงเข้ากับกำไร(ขาดทุน)จาก ledger เพื่อแสดง "สุทธิหลังปรับปรุง".

export type ProfitLossRow = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
};

export type ProfitLossStatement = {
  revenueRows: ProfitLossRow[];
  expenseRows: ProfitLossRow[];
  totalRevenue: number;
  totalExpenses: number; // เฉพาะค่าใช้จ่ายจาก ledger
  netProfit: number; // totalRevenue − totalExpenses (จาก ledger เท่านั้น)
  payrollRows: ProfitLossRow[]; // ปรับปรุง: เงินเดือน/แรงงาน (ยังไม่ลง ledger)
  payrollTotal: number;
  unsetKeys: string[];
  from: string;
  to: string;
};

export async function getProfitLossStatement(params: {
  from: string;
  to: string;
}): Promise<ProfitLossStatement> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [{ entries, meta, unsetKeys }, payroll] = await Promise.all([
    buildLedger(),
    prisma.monthlyPayrollExpense.findMany({
      select: {
        year: true,
        m1: true, m2: true, m3: true, m4: true, m5: true, m6: true,
        m7: true, m8: true, m9: true, m10: true, m11: true, m12: true,
        account: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  // ── รายได้ / ค่าใช้จ่าย จาก ledger (เฉพาะรายการในช่วง from–to) ──
  const agg = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    if (e.date < fromDate || e.date > toDate) continue;
    const a = agg.get(e.accountId) ?? { debit: 0, credit: 0 };
    a.debit += e.debit;
    a.credit += e.credit;
    agg.set(e.accountId, a);
  }

  const revenueRows: ProfitLossRow[] = [];
  const expenseRows: ProfitLossRow[] = [];
  for (const [accId, a] of agg) {
    const m = meta.get(accId);
    if (!m) continue;
    if (m.type === "REVENUE") {
      const amount = round2(a.credit - a.debit);
      if (amount !== 0) revenueRows.push({ accountId: accId, code: m.code, name: m.name, amount });
    } else if (m.type === "EXPENSE") {
      const amount = round2(a.debit - a.credit);
      if (amount !== 0) expenseRows.push({ accountId: accId, code: m.code, name: m.name, amount });
    }
  }

  const bySortKey = (x: ProfitLossRow, y: ProfitLossRow) =>
    (meta.get(x.accountId)?.sortKey ?? x.code).localeCompare(
      meta.get(y.accountId)?.sortKey ?? y.code,
      undefined,
      { numeric: true }
    );
  revenueRows.sort(bySortKey);
  expenseRows.sort(bySortKey);

  // ── ปรับปรุง: ค่าใช้จ่ายเงินเดือน/แรงงาน (คิดเป็นรายเดือนเต็ม — รวมเฉพาะเดือนที่อยู่ในช่วง) ──
  const monthsInRange = new Set<string>();
  {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    while (d <= end) {
      monthsInRange.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
      d.setMonth(d.getMonth() + 1);
    }
  }
  const payrollMap = new Map<string, ProfitLossRow>();
  for (const p of payroll) {
    const rec = p as unknown as { [k: string]: number };
    let sum = 0;
    for (let i = 1; i <= 12; i++) {
      if (monthsInRange.has(`${p.year}-${i}`)) sum += Number(rec[`m${i}`]) || 0;
    }
    if (sum === 0) continue;
    const existing = payrollMap.get(p.account.id);
    if (existing) existing.amount = round2(existing.amount + sum);
    else
      payrollMap.set(p.account.id, {
        accountId: p.account.id,
        code: p.account.code,
        name: p.account.name,
        amount: round2(sum),
      });
  }
  const payrollRows = Array.from(payrollMap.values()).sort((x, y) =>
    x.code.localeCompare(y.code, undefined, { numeric: true })
  );
  const payrollTotal = round2(payrollRows.reduce((s, r) => s + r.amount, 0));

  const totalRevenue = round2(revenueRows.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round2(expenseRows.reduce((s, r) => s + r.amount, 0));
  const netProfit = round2(totalRevenue - totalExpenses);

  return {
    revenueRows,
    expenseRows,
    totalRevenue,
    totalExpenses,
    netProfit,
    payrollRows,
    payrollTotal,
    unsetKeys,
    from,
    to,
  };
}
