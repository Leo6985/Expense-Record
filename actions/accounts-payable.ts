"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export async function getAccountsPayable(search?: string, status?: string) {
  return prisma.accountsPayable.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { apNumber: { contains: search, mode: "insensitive" } },
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { vendor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: {
      vendor: { select: { name: true } },
      po: { select: { poNumber: true } },
      gr: { select: { grNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAccountsPayableById(id: string) {
  return prisma.accountsPayable.findUnique({
    where: { id },
    include: {
      vendor: true,
      po: { include: { items: true } },
      gr: true,
    },
  });
}

export async function getNextAPNumber() {
  const count = await prisma.accountsPayable.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `AP${year}${month}${String(count + 1).padStart(4, "0")}`;
}

export async function createAccountsPayable(data: {
  vendorId: string;
  poId?: string;
  grId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  vatAmount?: number;
  notes?: string;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const apNumber = await getNextAPNumber();
  const vatAmount = data.vatAmount ?? 0;
  const totalAmount = data.amount + vatAmount;

  const ap = await prisma.accountsPayable.create({
    data: {
      apNumber,
      vendorId: data.vendorId,
      poId: data.poId || null,
      grId: data.grId || null,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: new Date(data.dueDate),
      amount: data.amount,
      vatAmount,
      totalAmount,
      notes: data.notes,
      createdByName,
      createdById,
    },
  });


  revalidatePath("/accounts-payable");
  return ap;
}

export async function approveAccountsPayable(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เน€เธเธเธฒเธฐเธเธนเนเธเธฑเธ”เธเธฒเธฃเธซเธฃเธทเธญเน€เธเนเธฒเธเธญเธเน€เธ—เนเธฒเธเธฑเนเธเธ—เธตเนเธญเธเธธเธกเธฑเธ•เธดเนเธ”เน");

  await prisma.accountsPayable.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "" },
  });

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

export async function unapproveAccountsPayable(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const ap = await prisma.accountsPayable.findUnique({
    where: { id },
    include: { paymentPrepItems: { include: { prep: true } } },
  });
  if (!ap) throw new Error("ไม่พบรายการหนี้");
  if (ap.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะรายการที่อนุมัติแล้วเท่านั้น");
  const hasActivePrep = ap.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED");
  if (hasActivePrep) throw new Error("ไม่สามารถยกเลิกอนุมัติได้ เนื่องจากถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว");

  await prisma.accountsPayable.update({
    where: { id },
    data: { status: "PENDING", approvedByName: null, approvedById: null },
  });

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

export async function cancelAccountsPayable(id: string) {
  await prisma.accountsPayable.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/accounts-payable");
  revalidatePath(`/accounts-payable/${id}`);
}

export async function getAvailableAPForPayment() {
  return prisma.accountsPayable.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    include: { vendor: { select: { name: true, bankAccountNo: true, bankAccountName: true } } },
    orderBy: { dueDate: "asc" },
  });
}

export async function getReceivedPOsWithoutAP() {
  return prisma.purchaseOrder.findMany({
    where: {
      status: "RECEIVED",
      accountsPayable: {
        none: {
          status: { notIn: ["CANCELLED"] },
        },
      },
    },
    include: {
      vendor: true,
      items: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}
