"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

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
            include: { vendor: true },
          },
        },
      },
      payment: {
        include: { companyBankAccount: true },
      },
    },
  });
}

export async function getNextPrepNumber() {
  const count = await prisma.paymentPrep.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `PP${year}${month}${String(count + 1).padStart(4, "0")}`;
}

export async function createPaymentPrep(data: {
  paymentDate: string;
  apIds: string[];
  whtRates: Record<string, number>;
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const prepNumber = await getNextPrepNumber();

  const aps = await prisma.accountsPayable.findMany({
    where: { id: { in: data.apIds } },
  });

  const items = aps.map((ap) => {
    const rate = data.whtRates[ap.id] ?? 0;
    const whtAmount = Math.round(ap.amount * (rate / 100) * 100) / 100;
    const netAmount = ap.totalAmount - whtAmount;
    return { apId: ap.id, amount: ap.totalAmount, withholdingTaxRate: rate, withholdingTaxAmount: whtAmount, netAmount };
  });

  const totalAmount = items.reduce((s, i) => s + i.amount, 0);
  const totalWithholdingTax = Math.round(items.reduce((s, i) => s + i.withholdingTaxAmount, 0) * 100) / 100;
  const netPayableAmount = Math.round((totalAmount - totalWithholdingTax) * 100) / 100;

  const prep = await prisma.paymentPrep.create({
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
  });

  await prisma.accountsPayable.updateMany({
    where: { id: { in: data.apIds } },
    data: { status: "PAYMENT_PREP" },
  });



  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
  return prep;
}

export async function approvePaymentPrep(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เน€เธเธเธฒเธฐเธเธนเนเธเธฑเธ”เธเธฒเธฃเธซเธฃเธทเธญเน€เธเนเธฒเธเธญเธเน€เธ—เนเธฒเธเธฑเนเธเธ—เธตเนเธญเธเธธเธกเธฑเธ•เธดเนเธ”เน");

  await prisma.paymentPrep.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
  });
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

  await prisma.paymentPrep.update({
    where: { id },
    data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
  });

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
  await prisma.accountsPayable.updateMany({
    where: { id: { in: apIds } },
    data: { status: "APPROVED" },
  });

  await prisma.paymentPrep.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/payment-prep");
  revalidatePath("/accounts-payable");
}
