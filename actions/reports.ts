"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { inventorySnapshotsTable, InventorySnapshotRecord } from "@/lib/sheets-tables";

export async function getDailyPaymentsReport(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  return prisma.payment.findMany({
    where: {
      paymentDate: { gte: fromDate, lte: toDate },
    },
    include: {
      companyBankAccount: true,
      prep: {
        include: {
          items: {
            include: {
              ap: {
                include: { vendor: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { paymentDate: "asc" },
  });
}

export async function getOutstandingAPReport() {
  return prisma.accountsPayable.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED", "PAYMENT_PREP"] },
    },
    include: {
      vendor: { select: { name: true, bankAccountNo: true, bankAccountName: true, bankName: true } },
      po: { select: { poNumber: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function getOverdueAPReport() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.accountsPayable.findMany({
    where: {
      dueDate: { lt: today },
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    include: {
      vendor: { select: { name: true, bankAccountNo: true, bankAccountName: true } },
      po: { select: { poNumber: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function getMonthlyPurchaseReport(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  return prisma.accountsPayable.findMany({
    where: {
      invoiceDate: { gte: from, lte: to },
    },
    include: {
      vendor: { select: { name: true, code: true } },
      po: { select: { poNumber: true } },
    },
    orderBy: { invoiceDate: "asc" },
  });
}

export async function getMonthlyWithholdingTaxReport(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const items = await prisma.paymentPrepItem.findMany({
    where: {
      withholdingTaxAmount: { gt: 0 },
      prep: { payment: { paymentDate: { gte: from, lte: to } } },
    },
    include: {
      ap: { include: { vendor: { select: { name: true, taxId: true, address: true } } } },
      prep: { include: { payment: true } },
    },
  });

  return items
    .filter((item): item is typeof item & { prep: { payment: NonNullable<typeof item.prep.payment> } } => item.prep.payment !== null)
    .sort((a, b) => a.prep.payment.paymentDate.getTime() - b.prep.payment.paymentDate.getTime());
}

export type ProfitLossCategory = { accountId: string | null; accountCode: string | null; accountName: string; amount: number };
export type ProfitLossMonth = { month: number; revenue: number; expenses: number; net: number };
export type ProfitLossReport = {
  revenue: number;
  expenses: number;
  net: number;
  categoryBreakdown: ProfitLossCategory[];
  monthly?: ProfitLossMonth[];
};

function addToCategory(
  map: Map<string, ProfitLossCategory>,
  accountId: string | null,
  accountCode: string | null,
  accountName: string,
  amount: number
) {
  const key = accountId ?? `name:${accountName}`;
  const existing = map.get(key);
  if (existing) existing.amount += amount;
  else map.set(key, { accountId, accountCode, accountName, amount });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// รายได้ = SalesInvoice.amount (ก่อน VAT, ไม่รวมที่ยกเลิก) ตาม invoiceDate + ปรับปรุงจากใบเพิ่ม/ลดหนี้ที่
// อนุมัติแล้วตาม noteDate ของตัวมันเอง (ไม่ย้อนกลับไปคาบเดิมของใบกำกับภาษี — สอดคล้องกับ
// getEffectiveInvoiceTotal ใน lib/sales-invoice-reconciliation.ts ที่ถือว่าใบเพิ่ม/ลดหนี้เป็นเหตุการณ์ของ
// มันเอง). ค่าใช้จ่าย = AccountsPayable.amount (ก่อน VAT, ไม่รวมที่ยกเลิก) ตาม invoiceDate — ฐานเดียวกับ
// getMonthlyPurchaseReport ด้านล่าง เพื่อให้ยอดรวมตรงกันข้ามสองรายงาน. แยกหมวดหมู่ค่าใช้จ่ายผ่าน
// AP -> GoodsReceipt -> GoodsReceiptItem -> POItem -> Product -> ChartOfAccount โดยกระจายยอด AP.amount
// ตามสัดส่วนมูลค่าแต่ละบรรทัด (ไม่ใช่ totalPrice ดิบ) เพื่อให้ผลรวมของหมวดหมู่ตรงกับยอดรวมค่าใช้จ่ายเป๊ะ
// แม้จะมีการปัดเศษหรือแก้ไข AP.amount ภายหลังสร้างจาก GR ก็ตาม. AP ที่ไม่มีสาย GR (เช่น นำเข้า CSV
// "สินค้า/บริการที่ซื้อมาเพื่อขาย" หรือตั้งหนี้ตรงจากฟอร์ม) จะใช้ AP.accountId ที่ตั้งไว้เองแทน (ถ้ามี) —
// เหลือ "ไม่ระบุหมวดบัญชี" เฉพาะกรณีไม่มีทั้งสาย GR และ accountId เท่านั้น.
export async function getProfitLossReport(params: { year: number; month?: number }): Promise<ProfitLossReport> {
  const { year, month } = params;
  const from = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const to = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const [invoices, notes, aps] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: from, lt: to } },
      select: { amount: true, invoiceDate: true },
    }),
    prisma.debitCreditNote.findMany({
      where: { status: "APPROVED", noteDate: { gte: from, lt: to } },
      select: { type: true, amount: true, noteDate: true },
    }),
    prisma.accountsPayable.findMany({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: from, lt: to } },
      select: {
        amount: true,
        invoiceDate: true,
        account: { select: { id: true, code: true, name: true } },
        gr: {
          select: {
            items: {
              select: {
                totalPrice: true,
                poItem: { select: { product: { select: { accountId: true, account: { select: { code: true, name: true } } } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const revenue = round2(
    invoices.reduce((s, i) => s + i.amount, 0) +
      notes.reduce((s, n) => s + (n.type === "DEBIT" ? n.amount : -n.amount), 0)
  );

  const categoryMap = new Map<string, ProfitLossCategory>();
  let expenses = 0;
  for (const ap of aps) {
    expenses += ap.amount;
    const items = ap.gr?.items ?? [];
    const itemsSum = items.reduce((s, it) => s + it.totalPrice, 0);
    if (items.length === 0 || itemsSum <= 0) {
      addToCategory(categoryMap, ap.account?.id ?? null, ap.account?.code ?? null, ap.account?.name ?? "ไม่ระบุหมวดบัญชี", ap.amount);
      continue;
    }
    for (const item of items) {
      const accountId = item.poItem.product?.accountId ?? null;
      const accountCode = item.poItem.product?.account?.code ?? null;
      const accountName = item.poItem.product?.account?.name ?? "ไม่ระบุหมวดบัญชี";
      addToCategory(categoryMap, accountId, accountCode, accountName, (item.totalPrice / itemsSum) * ap.amount);
    }
  }
  expenses = round2(expenses);

  const categoryBreakdown = Array.from(categoryMap.values())
    .map((c) => ({ ...c, amount: round2(c.amount) }))
    .sort((a, b) => b.amount - a.amount);

  let monthly: ProfitLossMonth[] | undefined;
  if (!month) {
    const rev = Array(12).fill(0);
    const exp = Array(12).fill(0);
    for (const inv of invoices) rev[inv.invoiceDate.getMonth()] += inv.amount;
    for (const n of notes) rev[n.noteDate.getMonth()] += n.type === "DEBIT" ? n.amount : -n.amount;
    for (const ap of aps) exp[ap.invoiceDate.getMonth()] += ap.amount;
    monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenue: round2(rev[i]),
      expenses: round2(exp[i]),
      net: round2(rev[i] - exp[i]),
    }));
  }

  return { revenue, expenses, net: round2(revenue - expenses), categoryBreakdown, monthly };
}

/**
 * Postgres remains authoritative, so every write dual-writes into the Google Sheet as a
 * synced mirror. If the Sheet side fails, the Postgres write already succeeded — surface
 * the sync failure instead of silently losing it, but don't roll back the Postgres write.
 */
async function syncInventorySnapshotToSheet(snapshot: {
  id: string;
  periodKey: string;
  openingValue: number;
  closingValue: number;
  updatedAt: Date;
}) {
  const record: InventorySnapshotRecord = { ...snapshot };
  try {
    await inventorySnapshotsTable.update(snapshot.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await inventorySnapshotsTable.create(record);
    } else {
      throw err;
    }
  }
}

// periodKey is "YYYY-MM" for a single-month P&L period or "YYYY" for a full-year period —
// matches the period the profit-loss page is currently showing.
export async function getInventorySnapshot(periodKey: string) {
  return prisma.inventorySnapshot.findUnique({ where: { periodKey } });
}

export async function saveInventorySnapshot(periodKey: string, openingValue: number, closingValue: number) {
  const snapshot = await prisma.inventorySnapshot.upsert({
    where: { periodKey },
    update: { openingValue, closingValue },
    create: { periodKey, openingValue, closingValue },
  });
  try {
    await syncInventorySnapshotToSheet(snapshot);
  } catch (err) {
    console.error("syncInventorySnapshotToSheet failed after saveInventorySnapshot:", err);
  }

  revalidatePath("/reports/profit-loss");
  return snapshot;
}

export async function getCompanyBankAccounts() {
  return prisma.companyBankAccount.findMany({
    where: { isActive: true },
    orderBy: { bankName: "asc" },
  });
}

export type BankStatementEntry = {
  id: string;
  date: Date;
  documentNumber: string;
  type: "IN" | "OUT";
  description: string;
  paymentMethod: string;
  referenceNumber: string | null;
  withholdingTax: number;
  amount: number;
  notes: string | null;
  href: string;
};

export async function getBankStatementReport(bankAccountId: string, from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [account, payments, receipts] = await Promise.all([
    prisma.companyBankAccount.findUnique({ where: { id: bankAccountId } }),
    prisma.payment.findMany({
      where: {
        companyBankAccountId: bankAccountId,
        paymentDate: { gte: fromDate, lte: toDate },
      },
      include: {
        prep: {
          include: {
            items: {
              include: {
                ap: { include: { vendor: { select: { name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.receipt.findMany({
      where: {
        companyBankAccountId: bankAccountId,
        status: { not: "CANCELLED" },
        receiptDate: { gte: fromDate, lte: toDate },
      },
      include: {
        items: { include: { invoice: { include: { customer: { select: { name: true } } } } } },
      },
      orderBy: { receiptDate: "asc" },
    }),
  ]);

  const outEntries: BankStatementEntry[] = payments.map((p) => ({
    id: p.id,
    date: p.paymentDate,
    documentNumber: p.paymentNumber,
    type: "OUT",
    description: [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", "),
    paymentMethod: p.paymentMethod,
    referenceNumber: p.referenceNumber,
    withholdingTax: p.prep.totalWithholdingTax ?? 0,
    amount: p.amount,
    notes: p.notes,
    href: `/payment-prep/${p.prepId}`,
  }));

  const inEntries: BankStatementEntry[] = receipts.map((r) => ({
    id: r.id,
    date: r.receiptDate,
    documentNumber: r.receiptNumber,
    type: "IN",
    description: [...new Set(r.items.map((i) => i.invoice.customer.name))].join(", "),
    paymentMethod: r.paymentMethod,
    referenceNumber: r.referenceNumber,
    withholdingTax: r.withholdingTaxAmount,
    amount: r.actualReceivedAmount,
    notes: r.notes,
    href: `/receipts/${r.id}`,
  }));

  const entries = [...outEntries, ...inEntries].sort((a, b) => a.date.getTime() - b.date.getTime());

  return { account, entries };
}
