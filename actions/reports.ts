"use server";

import { prisma } from "@/lib/prisma";

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

export async function getCompanyBankAccounts() {
  return prisma.companyBankAccount.findMany({
    where: { isActive: true },
    orderBy: { bankName: "asc" },
  });
}

export async function getBankStatementReport(bankAccountId: string, from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const [account, payments] = await Promise.all([
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
  ]);

  return { account, payments };
}
