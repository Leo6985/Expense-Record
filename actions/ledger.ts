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
  AUTO_VOUCHER_BOOK_LABEL,
  autoVoucherOrigin,
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

  // เอกสารต้นทางที่มีใบสำคัญอนุมัติแล้ว (สมุดรายวันขาย/ซื้อ) — ข้ามการสังเคราะห์คู่บัญชีในข้อ 2/6
  // เพื่อไม่ให้นับซ้ำ (คู่บัญชีเข้าบัญชีแยกประเภทผ่านใบสำคัญในข้อ 1 แทน)
  const postedViaVoucher = (sourceType: string) =>
    new Set(
      jvs.filter((v) => v.sourceType === sourceType && v.sourceId).map((v) => v.sourceId as string)
    );
  const invoicesPostedViaVoucher = postedViaVoucher("SI");
  const apsPostedViaVoucher = postedViaVoucher("AP");
  const receiptsPostedViaVoucher = postedViaVoucher("RC");
  const paymentsPostedViaVoucher = postedViaVoucher("PAY");

  // 1) สมุดรายวันทั่วไป + ใบสำคัญที่สร้างอัตโนมัติจากสมุดรายวันย่อย (เฉพาะอนุมัติแล้ว)
  for (const v of jvs) {
    const origin = v.sourceType && v.sourceId ? autoVoucherOrigin(v.sourceType, v.sourceId) : null;
    const doc = new DocEntries({
      date: v.voucherDate,
      sourceType: "JV",
      sourceId: v.id,
      sourceNumber: v.voucherNumber,
      description: v.description,
      bookLabel: v.sourceType ? AUTO_VOUCHER_BOOK_LABEL[v.sourceType] : undefined,
      originHref: origin?.href,
      originLabel: origin?.label,
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
  //    (ยกเว้นใบที่โพสต์ผ่านใบสำคัญสมุดรายวันรับเงินที่อนุมัติแล้ว)
  for (const r of receipts) {
    if (receiptsPostedViaVoucher.has(r.id)) continue;
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

  // 5) จ่ายเงิน (Payment ผ่าน PaymentPrep) — ยกเว้นใบที่โพสต์ผ่านใบสำคัญสมุดรายวันจ่ายเงินที่อนุมัติแล้ว
  for (const p of payments) {
    if (paymentsPostedViaVoucher.has(p.id)) continue;
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

  // 6) ตั้งหนี้ (AP) — แยกหมวดค่าใช้จ่ายผ่านสาย GR/Product (ยกเว้นใบที่โพสต์ผ่านใบสำคัญสมุดรายวันซื้อ
  //    ที่อนุมัติแล้ว)
  for (const ap of aps) {
    if (apsPostedViaVoucher.has(ap.id)) continue;
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
  sourceTypeLabel: string; // ป้ายสมุดรายวัน — เป็นชื่อสมุดรายวันย่อยถ้ารายการมาจากใบสำคัญที่สร้างอัตโนมัติ
  sourceNumber: string;
  description: string;
  href: string;
  originLabel?: string; // ป้าย + ลิงก์เอกสารต้นทาง (ใบกำกับภาษีขาย/ใบตั้งหนี้/ใบรับชำระ/การจ่ายเงิน)
  originHref?: string;
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
        sourceTypeLabel: e.bookLabel ?? SOURCE_TYPE_LABEL[e.sourceType],
        sourceNumber: e.sourceNumber,
        description: e.description,
        href: sourceHref(e.sourceType, e.sourceId),
        originLabel: e.originLabel,
        originHref: e.originHref,
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

// ─────────────────────────────────────────────────────────────────────────────
// งบแสดงฐานะทางการเงิน (Statement of Financial Position / Balance Sheet)
// ─────────────────────────────────────────────────────────────────────────────
//
// ยอดคงเหลือ ณ วันที่กำหนด ของบัญชีประเภท ASSET / LIABILITY / EQUITY จาก buildLedger()
// (ชุดเดียวกับงบทดลอง). "กำไร(ขาดทุน)สะสม" = รายได้สะสม − ค่าใช้จ่ายสะสม ถึงวันที่นั้น
// (ระบบยังไม่มีรายการปิดบัญชีสิ้นปี จึงคำนวณให้เอง). สินทรัพย์ควร = หนี้สิน + ส่วนของผู้ถือหุ้น
// เพราะงบทดลองดุลเสมอ — ผลต่าง (ถ้ามี) มาจากบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า.
// หมายเหตุ: ยอดยกมาก่อนเริ่มใช้ระบบ (เช่น openingBalance ของบัญชีธนาคาร) ไม่ได้ลงบัญชีแยกประเภท
// จึงไม่รวมในงบนี้ เช่นเดียวกับงบทดลอง/งบกำไรขาดทุน.

export type BalanceSheetRow = { accountId: string; code: string; name: string; amount: number };

export type BalanceSheetResult = {
  asOf: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number; // Σ equity accounts + retainedEarnings
  unclassified: BalanceSheetRow[]; // บัญชีที่ยังไม่จัดหมวด (UNSET/UNKNOWN) ที่ยังมียอด
  unclassifiedNet: number; // net (เดบิต − เครดิต) ของกลุ่มยังไม่จัดหมวด
  diff: number; // totalAssets − (totalLiabilities + totalEquity); = −unclassifiedNet เมื่อข้อมูลครบ
  balanced: boolean;
  unsetKeys: string[];
};

export async function getBalanceSheet(params: { asOf: string }): Promise<BalanceSheetResult> {
  const { asOf } = params;
  const asOfDate = new Date(asOf);
  asOfDate.setHours(23, 59, 59, 999);

  const { entries, meta, unsetKeys } = await buildLedger();

  const netByAccount = new Map<string, number>();
  for (const e of entries) {
    if (e.date > asOfDate) continue;
    netByAccount.set(e.accountId, round2((netByAccount.get(e.accountId) ?? 0) + e.debit - e.credit));
  }

  const assets: BalanceSheetRow[] = [];
  const liabilities: BalanceSheetRow[] = [];
  const equity: BalanceSheetRow[] = [];
  const unclassified: BalanceSheetRow[] = [];
  let revenueCum = 0;
  let expenseCum = 0;

  for (const [accId, net] of netByAccount) {
    if (Math.abs(net) < 0.005) continue;
    const m = meta.get(accId) ?? { code: "?", name: "(ไม่ทราบบัญชี)", type: "UNKNOWN", sortKey: "zzzz" };
    const row = (amount: number): BalanceSheetRow => ({ accountId: accId, code: m.code, name: m.name, amount: round2(amount) });
    switch (m.type) {
      case "ASSET":
        assets.push(row(net));
        break;
      case "LIABILITY":
        liabilities.push(row(-net));
        break;
      case "EQUITY":
        equity.push(row(-net));
        break;
      case "REVENUE":
        revenueCum = round2(revenueCum - net);
        break;
      case "EXPENSE":
        expenseCum = round2(expenseCum + net);
        break;
      default:
        unclassified.push(row(net));
    }
  }

  const bySortKey = (x: BalanceSheetRow, y: BalanceSheetRow) =>
    (meta.get(x.accountId)?.sortKey ?? x.code).localeCompare(meta.get(y.accountId)?.sortKey ?? y.code, undefined, { numeric: true });
  assets.sort(bySortKey);
  liabilities.sort(bySortKey);
  equity.sort(bySortKey);
  unclassified.sort(bySortKey);

  const retainedEarnings = round2(revenueCum - expenseCum);
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0) + retainedEarnings);
  const unclassifiedNet = round2(unclassified.reduce((s, r) => s + r.amount, 0));
  const diff = round2(totalAssets - (totalLiabilities + totalEquity));

  return {
    asOf,
    assets,
    liabilities,
    equity,
    retainedEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    unclassified,
    unclassifiedNet,
    diff,
    balanced: Math.abs(diff) < 0.01,
    unsetKeys,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// งบกระแสเงินสด (Statement of Cash Flows) — วิธีตรง (direct method)
// ─────────────────────────────────────────────────────────────────────────────
//
// "เงินสด" = บัญชีแยกที่ผูกไว้กับบัญชีธนาคารบริษัท (key "bank:<id>" หรือ "bank_default").
// รายการที่แตะบัญชีเงินสดจะถูกจัดกลุ่มตามที่มา:
//   • รับชำระ (RC / ใบสำคัญสมุดรายวันรับเงิน)  → กิจกรรมดำเนินงาน: รับจากลูกค้า
//   • จ่ายเงิน (PAY / ใบสำคัญสมุดรายวันจ่ายเงิน) → กิจกรรมดำเนินงาน: จ่ายเจ้าหนี้/ค่าใช้จ่าย
//   • สมุดรายวันทั่วไป → ดูประเภทบัญชีคู่: รายได้/ค่าใช้จ่าย/ลูกหนี้/เจ้าหนี้ = ดำเนินงาน,
//     สินทรัพย์อื่น = ลงทุน, หนี้สินอื่น/ทุน = จัดหาเงิน
// เงินสดต้นงวด + กระแสเงินสดสุทธิ = เงินสดปลายงวด (คำนวณอิสระเพื่อตรวจสอบ).

export type CashFlowLine = { label: string; amount: number };

export type CashFlowResult = {
  from: string;
  to: string;
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  reconciled: boolean;
  cashAccounts: { code: string; name: string; opening: number; closing: number }[];
  unmappedBanks: string[]; // ธนาคารที่มีเงินเคลื่อนไหวแต่ยังไม่ผูกผังบัญชี
  unsetKeys: string[];
};

export async function getCashFlow(params: { from: string; to: string }): Promise<CashFlowResult> {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [{ entries, meta, unsetKeys }, config, banks] = await Promise.all([
    buildLedger(),
    prisma.accountingConfig.findMany(),
    prisma.companyBankAccount.findMany({ select: { id: true, bankName: true, accountNo: true } }),
  ]);

  const bankLabelById = new Map(banks.map((b) => [b.id, `${b.bankName} ${b.accountNo}`]));
  const cfgAcc = (key: string) => config.find((c) => c.key === key)?.accountId ?? null;
  const cashAccountIds = new Set(
    config.filter((c) => (c.key.startsWith("bank:") || c.key === "bank_default") && c.accountId).map((c) => c.accountId as string)
  );
  // บัญชีคุมยอดฝั่ง "ดำเนินงาน" (ลูกหนี้/เจ้าหนี้/ภาษี/ภาษีถูกหัก) — รายการเงินสดที่มีคู่บัญชีเหล่านี้ = ดำเนินงาน
  const operatingCtrlIds = new Set(
    ["ar", "wht_receivable", "ap", "wht_payable", "vat_output", "vat_input", "bank_fee", "receipt_variance"]
      .map(cfgAcc)
      .filter((x): x is string => !!x)
  );

  // จัดกลุ่มรายการตามเอกสาร เพื่อดูบัญชีคู่ของขาเงินสด
  const docs = new Map<string, RawLedgerEntry[]>();
  for (const e of entries) {
    const k = `${e.sourceType}:${e.sourceId}`;
    const arr = docs.get(k) ?? [];
    arr.push(e);
    docs.set(k, arr);
  }

  const RECEIPT_BOOK = AUTO_VOUCHER_BOOK_LABEL.RC;
  const PAYMENT_BOOK = AUTO_VOUCHER_BOOK_LABEL.PAY;

  const opBuckets = new Map<string, number>();
  const invBuckets = new Map<string, number>();
  const finBuckets = new Map<string, number>();
  const bump = (m: Map<string, number>, label: string, amt: number) => m.set(label, round2((m.get(label) ?? 0) + amt));

  let openingCash = 0;
  let closingCash = 0;
  const perAccount = new Map<string, { opening: number; closing: number }>();
  const unmappedBanks = new Set<string>();

  for (const [, legs] of docs) {
    const cashLegs = legs.filter((l) => cashAccountIds.has(l.accountId));
    if (cashLegs.length === 0) {
      // ธนาคารที่ยังไม่ผูกผังบัญชี — ขาเงินสดจะตกใน __unset__:bank:<id>
      for (const l of legs) {
        if (isUnsetAccountId(l.accountId) && unsetKeyOf(l.accountId).startsWith("bank:")) {
          const bid = unsetKeyOf(l.accountId).slice("bank:".length);
          unmappedBanks.add(bankLabelById.get(bid) ?? bid);
        }
      }
      continue;
    }

    for (const cl of cashLegs) {
      const delta = round2(cl.debit - cl.credit); // + = เงินสดเข้า
      const pa = perAccount.get(cl.accountId) ?? { opening: 0, closing: 0 };
      if (cl.date < fromDate) pa.opening = round2(pa.opening + delta);
      if (cl.date <= toDate) pa.closing = round2(pa.closing + delta);
      perAccount.set(cl.accountId, pa);
      if (cl.date < fromDate) openingCash = round2(openingCash + delta);
      if (cl.date <= toDate) closingCash = round2(closingCash + delta);

      if (cl.date < fromDate || cl.date > toDate) continue;

      const bl = cl.bookLabel;
      if (cl.sourceType === "RC" || bl === RECEIPT_BOOK) {
        bump(opBuckets, "รับชำระจากลูกค้า", delta);
        continue;
      }
      if (cl.sourceType === "PAY" || bl === PAYMENT_BOOK) {
        bump(opBuckets, "จ่ายชำระเจ้าหนี้และค่าใช้จ่าย", delta);
        continue;
      }
      // สมุดรายวันทั่วไป — ดูบัญชีคู่ (ขาที่ไม่ใช่เงินสด) ของเอกสารเดียวกัน
      const counter = legs.filter((l) => !cashAccountIds.has(l.accountId));
      const typeOf = (id: string) => meta.get(id)?.type ?? "UNKNOWN";
      const isOperating = counter.some(
        (l) => ["REVENUE", "EXPENSE"].includes(typeOf(l.accountId)) || operatingCtrlIds.has(l.accountId)
      );
      const isInvesting = counter.some((l) => typeOf(l.accountId) === "ASSET" && !operatingCtrlIds.has(l.accountId));
      const isFinancing = counter.some(
        (l) => ["LIABILITY", "EQUITY"].includes(typeOf(l.accountId)) && !operatingCtrlIds.has(l.accountId)
      );

      if (isOperating || (!isInvesting && !isFinancing)) bump(opBuckets, "รายการดำเนินงานอื่น (สมุดรายวัน)", delta);
      else if (isInvesting) bump(invBuckets, "รายการลงทุน (สมุดรายวัน)", delta);
      else bump(finBuckets, "รายการจัดหาเงิน (สมุดรายวัน)", delta);
    }
  }

  const toLines = (m: Map<string, number>) =>
    [...m.entries()].filter(([, v]) => Math.abs(v) >= 0.005).map(([label, amount]) => ({ label, amount: round2(amount) }));

  const operating = toLines(opBuckets);
  const investing = toLines(invBuckets);
  const financing = toLines(finBuckets);
  const netOperating = round2(operating.reduce((s, l) => s + l.amount, 0));
  const netInvesting = round2(investing.reduce((s, l) => s + l.amount, 0));
  const netFinancing = round2(financing.reduce((s, l) => s + l.amount, 0));
  const netChange = round2(netOperating + netInvesting + netFinancing);

  const cashAccounts = [...perAccount.entries()]
    .map(([accId, v]) => {
      const m = meta.get(accId);
      return { code: m?.code ?? "?", name: m?.name ?? "(ไม่ทราบบัญชี)", opening: round2(v.opening), closing: round2(v.closing) };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return {
    from,
    to,
    operating,
    investing,
    financing,
    netOperating,
    netInvesting,
    netFinancing,
    netChange,
    openingCash,
    closingCash,
    reconciled: Math.abs(round2(openingCash + netChange - closingCash)) < 0.01,
    cashAccounts,
    unmappedBanks: [...unmappedBanks],
    unsetKeys,
  };
}
