"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncAPStatus, syncAPsToSheetById } from "./accounts-payable";
import {
  paymentPrepsTable, paymentPrepItemsTable, PaymentPrepRecord, PaymentPrepItemRecord,
} from "@/lib/sheets-tables";

const AMOUNT_TOLERANCE = 0.01;

/**
 * Postgres remains authoritative (Payment.prepId still holds a real FK into this table's
 * id), so every write dual-writes into the Google Sheet as a synced mirror. If the Sheet
 * side fails, the Postgres write already succeeded — surface the sync failure instead of
 * silently losing it, but don't roll back the Postgres write.
 */
export async function syncPrepToSheet(prep: {
  id: string;
  prepNumber: string;
  prepDate: Date;
  paymentDate: Date;
  totalAmount: number;
  totalWithholdingTax: number;
  netPayableAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: PaymentPrepRecord = { ...prep };
  try {
    await paymentPrepsTable.update(prep.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await paymentPrepsTable.create(record);
    } else {
      throw err;
    }
  }
}

async function syncPrepItemsToSheet(prepId: string, items: PaymentPrepItemRecord[]) {
  await paymentPrepItemsTable.replaceWhere((r) => r.prepId === prepId, items);
}

export async function getPaymentPreps(status?: string) {
  return prisma.paymentPrep.findMany({
    where: status ? { status } : undefined,
    include: {
      items: {
        include: {
          ap: {
            include: { vendor: { select: { name: true } } },
          },
        },
      },
      payment: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPaymentPrep(id: string) {
  return prisma.paymentPrep.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          ap: {
            include: { vendor: true, po: { select: { poNumber: true } } },
          },
        },
      },
      payment: {
        include: { companyBankAccount: true },
      },
    },
  });
}

// Sequences by the highest existing number for this month's prefix, not by row count —
// count() collides with an existing number once any row in the middle of the sequence
// has been deleted, causing the create to fail with a unique-constraint error.
export async function getNextPrepNumber() {
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `PP${year}${month}`;
  const last = await prisma.paymentPrep.findFirst({
    where: { prepNumber: { startsWith: prefix } },
    orderBy: { prepNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.prepNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

type PrepItemInput = { apId: string; amount: number; whtRate: number };

// Builds PaymentPrepItem rows for the given AP selections, validating each amount
// against how much of that AP's totalAmount is still unclaimed by other active preps.
// `excludePrepId` lets an edit exclude the prep's own current items from that check.
async function buildPrepItems(items: PrepItemInput[], excludePrepId?: string) {
  const aps = await prisma.accountsPayable.findMany({
    where: { id: { in: items.map((i) => i.apId) } },
    include: { paymentPrepItems: { include: { prep: true } } },
  });

  return items.map((di) => {
    const ap = aps.find((a) => a.id === di.apId);
    if (!ap) throw new Error("ไม่พบรายการหนี้");
    if (di.amount <= 0) throw new Error(`จำนวนเงินสำหรับ ${ap.apNumber} ต้องมากกว่า 0`);

    const consumedByOthers = ap.paymentPrepItems
      .filter((item) => item.prep.status !== "CANCELLED" && item.prepId !== excludePrepId)
      .reduce((s, item) => s + item.amount, 0);
    const remaining = ap.totalAmount - consumedByOthers;
    if (di.amount > remaining + AMOUNT_TOLERANCE) {
      throw new Error(`จำนวนเงินสำหรับ ${ap.apNumber} (${di.amount}) เกินยอดคงเหลือ (${Math.round(remaining * 100) / 100})`);
    }

    // Withholding tax applies to the pre-VAT portion; split the chosen amount proportionally.
    const vatRatio = ap.totalAmount > 0 ? ap.amount / ap.totalAmount : 1;
    const whtBase = di.amount * vatRatio;
    const withholdingTaxAmount = Math.round(whtBase * (di.whtRate / 100) * 100) / 100;
    const netAmount = Math.round((di.amount - withholdingTaxAmount) * 100) / 100;

    return { apId: ap.id, amount: di.amount, withholdingTaxRate: di.whtRate, withholdingTaxAmount, netAmount };
  });
}

function summarize(items: { amount: number; withholdingTaxAmount: number }[]) {
  const totalAmount = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const totalWithholdingTax = Math.round(items.reduce((s, i) => s + i.withholdingTaxAmount, 0) * 100) / 100;
  const netPayableAmount = Math.round((totalAmount - totalWithholdingTax) * 100) / 100;
  return { totalAmount, totalWithholdingTax, netPayableAmount };
}

export async function createPaymentPrep(data: {
  paymentDate: string;
  items: PrepItemInput[];
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  if (data.items.length === 0) throw new Error("กรุณาเลือกรายการหนี้อย่างน้อย 1 รายการ");

  const prepNumber = await getNextPrepNumber();
  const items = await buildPrepItems(data.items);
  const { totalAmount, totalWithholdingTax, netPayableAmount } = summarize(items);

  const prep = await prisma.$transaction(async (tx) => {
    const p = await tx.paymentPrep.create({
      data: {
        prepNumber,
        paymentDate: new Date(data.paymentDate),
        totalAmount,
        totalWithholdingTax,
        netPayableAmount,
        notes: data.notes,
        createdByName,
        createdById,
        items: { create: items },
      },
      include: { items: true },
    });

    for (const item of items) await syncAPStatus(tx, item.apId);

    return p;
  });

  await syncPrepToSheet(prep);
  await syncPrepItemsToSheet(prep.id, prep.items);
  await syncAPsToSheetById(items.map((i) => i.apId));

  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
  return prep;
}

export async function updatePaymentPrep(
  id: string,
  data: {
    paymentDate: string;
    items: PrepItemInput[];
    notes?: string;
  }
) {
  const prep = await prisma.paymentPrep.findUniqueOrThrow({
    where: { id },
    include: { items: true, payment: true },
  });
  if (prep.payment) throw new Error("ไม่สามารถแก้ไขได้ เนื่องจากมีการชำระเงินแล้ว");
  if (prep.status === "CANCELLED") throw new Error("ไม่สามารถแก้ไขใบเตรียมจ่ายที่ยกเลิกแล้วได้");
  if (data.items.length === 0) throw new Error("กรุณาเลือกรายการหนี้อย่างน้อย 1 รายการ");

  const oldApIds = prep.items.map((item) => item.apId);
  const newItems = await buildPrepItems(data.items, id);
  const { totalAmount, totalWithholdingTax, netPayableAmount } = summarize(newItems);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.paymentPrep.update({
      where: { id },
      data: {
        paymentDate: new Date(data.paymentDate),
        totalAmount,
        totalWithholdingTax,
        netPayableAmount,
        notes: data.notes,
        items: {
          deleteMany: {},
          create: newItems,
        },
      },
      include: { items: true },
    });

    const affectedApIds = Array.from(new Set([...oldApIds, ...newItems.map((i) => i.apId)]));
    for (const apId of affectedApIds) await syncAPStatus(tx, apId);

    return p;
  });

  await syncPrepToSheet(updated);
  await syncPrepItemsToSheet(id, updated.items);
  await syncAPsToSheetById([...oldApIds, ...newItems.map((i) => i.apId)]);

  revalidatePath("/payment-prep");
  revalidatePath(`/payment-prep/${id}`);
  revalidatePath("/accounts-payable");
}

export async function approvePaymentPrep(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const prep = await prisma.paymentPrep.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
  });
  await syncPrepToSheet(prep);

  revalidatePath("/payment-prep");
  revalidatePath(`/payment-prep/${id}`);
}

export async function unapprovePaymentPrep(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const prep = await prisma.paymentPrep.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!prep) throw new Error("ไม่พบใบเตรียมจ่าย");
  if (prep.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะใบเตรียมจ่ายที่อนุมัติแล้วเท่านั้น");
  if (prep.payment) throw new Error("ไม่สามารถยกเลิกอนุมัติได้ เนื่องจากมีการบันทึกการชำระเงินแล้ว");

  const updated = await prisma.paymentPrep.update({
    where: { id },
    data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
  });
  await syncPrepToSheet(updated);

  revalidatePath("/payment-prep");
  revalidatePath(`/payment-prep/${id}`);
}

export async function cancelPaymentPrep(id: string) {
  const prep = await prisma.paymentPrep.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!prep) return;

  const apIds = prep.items.map((item) => item.apId);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.paymentPrep.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    for (const apId of apIds) await syncAPStatus(tx, apId);
    return p;
  });

  await syncPrepToSheet(updated);
  await syncAPsToSheetById(apIds);

  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
}
