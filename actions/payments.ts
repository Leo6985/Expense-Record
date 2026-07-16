"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export async function getPayments() {
  return prisma.payment.findMany({
    include: {
      prep: {
        include: {
          items: {
            include: { ap: { include: { vendor: { select: { name: true } } } } },
          },
        },
      },
      companyBankAccount: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPayment(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      prep: {
        include: {
          items: {
            include: { ap: { include: { vendor: true } } },
          },
        },
      },
      companyBankAccount: true,
    },
  });
}

export async function getNextPaymentNumber() {
  const count = await prisma.payment.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `PAY${year}${month}${String(count + 1).padStart(4, "0")}`;
}

export async function createPayment(data: {
  prepId: string;
  paymentDate: string;
  paymentMethod: string;
  companyBankAccountId: string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const paymentNumber = await getNextPaymentNumber();

  const payment = await prisma.payment.create({
    data: {
      paymentNumber,
      prepId: data.prepId,
      paymentDate: new Date(data.paymentDate),
      paymentMethod: data.paymentMethod,
      companyBankAccountId: data.companyBankAccountId,
      amount: data.amount,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      createdByName,
      createdById,
    },
  });

  await prisma.paymentPrep.update({
    where: { id: data.prepId },
    data: { status: "PAID" },
  });

  const prep = await prisma.paymentPrep.findUnique({
    where: { id: data.prepId },
    include: { items: true },
  });

  if (prep) {
    const apIds = prep.items.map((item) => item.apId);
    await prisma.accountsPayable.updateMany({
      where: { id: { in: apIds } },
      data: { status: "PAID" },
    });
  }




  revalidatePath("/payments");
  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
  return payment;
}

export async function getCompanyBankAccounts() {
  return prisma.companyBankAccount.findMany({
    where: { isActive: true },
    orderBy: { bankName: "asc" },
  });
}

export async function createCompanyBankAccount(data: {
  bankName: string;
  branch?: string;
  accountNo: string;
  accountName: string;
}) {
  const account = await prisma.companyBankAccount.create({ data });
  revalidatePath("/company-accounts");
  return account;
}

export async function updateCompanyBankAccount(
  id: string,
  data: {
    bankName?: string;
    branch?: string;
    accountNo?: string;
    accountName?: string;
    isActive?: boolean;
  }
) {
  const account = await prisma.companyBankAccount.update({ where: { id }, data });
  revalidatePath("/company-accounts");
  return account;
}
