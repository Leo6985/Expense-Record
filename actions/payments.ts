"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncAPStatus, syncAPsToSheetById } from "./accounts-payable";
import { syncPrepToSheet } from "./payment-prep";
import {
  companyBankAccountsTable, CompanyBankAccountRecord, paymentsTable, PaymentRecord,
} from "@/lib/sheets-tables";

/** Same dual-write rationale as the other sync helpers in this codebase — see accounts-payable.ts. */
async function syncPaymentToSheet(payment: {
  id: string;
  paymentNumber: string;
  prepId: string;
  paymentDate: Date;
  paymentMethod: string;
  companyBankAccountId: string;
  amount: number;
  referenceNumber: string | null;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt: Date;
}) {
  const record: PaymentRecord = { ...payment };
  try {
    await paymentsTable.update(payment.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await paymentsTable.create(record);
    } else {
      throw err;
    }
  }
}

/**
 * Postgres remains authoritative (Payment.companyBankAccountId still holds a real FK there),
 * so every write dual-writes into the Google Sheet as a synced mirror. If the Sheet side fails,
 * the Postgres write already succeeded — surface the sync failure instead of silently losing it,
 * but don't roll back the Postgres write.
 */
async function syncCompanyBankAccountToSheet(account: {
  id: string;
  bankName: string;
  branch: string | null;
  accountNo: string;
  accountName: string;
  openingBalance: number;
  isActive: boolean;
  createdAt: Date;
}) {
  const record: CompanyBankAccountRecord = { ...account };
  try {
    await companyBankAccountsTable.update(account.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await companyBankAccountsTable.create(record);
    } else {
      throw err;
    }
  }
}

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

export async function getAdjacentPaymentIds(id: string) {
  const rows = await prisma.payment.findMany({
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? rows[idx - 1].id : null,
    nextId: idx < rows.length - 1 ? rows[idx + 1].id : null,
  };
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

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides with an existing number once any row in the middle of the sequence
// has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextPaymentNumber() {
  const year = String(new Date().getFullYear());
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `PAY${year}${month}`;
  const last = await prisma.payment.findFirst({
    where: { paymentNumber: { startsWith: prefix } },
    orderBy: { paymentNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.paymentNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
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

  const prepBefore = await prisma.paymentPrep.findUniqueOrThrow({
    where: { id: data.prepId },
    include: { items: true },
  });
  const apIds = prepBefore.items.map((item) => item.apId);

  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
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

    const prep = await tx.paymentPrep.update({
      where: { id: data.prepId },
      data: { status: "PAID" },
    });

    for (const apId of apIds) await syncAPStatus(tx, apId);

    return { payment: p, prep };
  });

  await syncPaymentToSheet(result.payment);
  await syncPrepToSheet(result.prep);
  await syncAPsToSheetById(apIds);

  revalidatePath("/payments");
  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
  return result.payment;
}

export async function deletePayment(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ลบการชำระเงินได้");

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { prep: { include: { items: true } } },
  });
  if (!payment) throw new Error("ไม่พบรายการชำระเงิน");

  const apIds = payment.prep.items.map((item) => item.apId);

  const prep = await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id } });
    const p = await tx.paymentPrep.update({
      where: { id: payment.prepId },
      data: { status: "APPROVED" },
    });
    for (const apId of apIds) await syncAPStatus(tx, apId);
    return p;
  });

  await paymentsTable.delete(id);
  await syncPrepToSheet(prep);
  await syncAPsToSheetById(apIds);

  revalidatePath("/payments");
  revalidatePath("/payment-prep");
  revalidatePath(`/payment-prep/${payment.prepId}`);
  revalidatePath("/accounts-payable");
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
  openingBalance?: number;
}) {
  const account = await prisma.companyBankAccount.create({ data });
  await syncCompanyBankAccountToSheet(account);
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
    openingBalance?: number;
    isActive?: boolean;
  }
) {
  const account = await prisma.companyBankAccount.update({ where: { id }, data });
  await syncCompanyBankAccountToSheet(account);
  revalidatePath("/company-accounts");
  return account;
}

export async function getAllCompanyBankAccounts() {
  return prisma.companyBankAccount.findMany({ orderBy: { bankName: "asc" } });
}

// No field on CompanyBankAccount is unique in the schema — accountNo is used as the natural
// match key for import purposes (create if no existing row has that accountNo, else update it).
export async function importCompanyBankAccountsCSV(
  rows: { bankName: string; branch?: string; accountNo: string; accountName: string }[]
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const toCreateInSheet: CompanyBankAccountRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<CompanyBankAccountRecord> }[] = [];

  for (const row of rows) {
    if (!row.bankName || !row.accountNo || !row.accountName) {
      errors.push(`แถว "${row.accountNo || "?"}" : ต้องมีธนาคาร เลขบัญชี และชื่อบัญชี`);
      continue;
    }
    try {
      const existing = await prisma.companyBankAccount.findFirst({ where: { accountNo: row.accountNo } });
      if (existing) {
        const data = { bankName: row.bankName, branch: row.branch || null, accountName: row.accountName };
        await prisma.companyBankAccount.update({ where: { id: existing.id }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const account = await prisma.companyBankAccount.create({
          data: { bankName: row.bankName, branch: row.branch || null, accountNo: row.accountNo, accountName: row.accountName },
        });
        created++;
        toCreateInSheet.push(account);
      }
    } catch {
      errors.push(`เลขบัญชี ${row.accountNo}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await companyBankAccountsTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await companyBankAccountsTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/company-accounts");
  return { created, updated, errors };
}
