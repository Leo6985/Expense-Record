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
