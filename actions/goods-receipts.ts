"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { addDays } from "date-fns";

export async function getGoodsReceipts() {
  return prisma.goodsReceipt.findMany({
    include: {
      po: {
        include: { vendor: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGoodsReceipt(id: string) {
  return prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      po: { include: { vendor: true, items: true } },
    },
  });
}

export async function getApprovedPOsForGR() {
  return prisma.purchaseOrder.findMany({
    where: { status: "APPROVED" },
    include: {
      vendor: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getNextGRNumber() {
  const count = await prisma.goodsReceipt.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `GR${year}${month}${String(count + 1).padStart(4, "0")}`;
}

export async function deleteGoodsReceipt(id: string) {
  const gr = await prisma.goodsReceipt.findUnique({ where: { id } });
  if (!gr) return;

  await prisma.goodsReceipt.delete({ where: { id } });
  await prisma.purchaseOrder.update({
    where: { id: gr.poId },
    data: { status: "APPROVED" },
  });



  revalidatePath("/goods-receipts");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${gr.poId}`);
}

async function getNextAPNumber(tx: Prisma.TransactionClient) {
  const count = await tx.accountsPayable.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `AP${year}${month}${String(count + 1).padStart(4, "0")}`;
}

export async function createGoodsReceipt(data: {
  poId: string;
  receivedDate: string;
  receivedBy?: string;
  notes?: string;
  invoiceNumber: string;
  invoiceDate: string;
  vatAmount?: number;
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const grNumber = await getNextGRNumber();

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: data.poId },
    include: { vendor: true },
  });

  const vatAmount = data.vatAmount ?? 0;
  const amount = po.totalAmount;
  const totalAmount = amount + vatAmount;
  const invoiceDate = new Date(data.invoiceDate);
  const dueDate = addDays(invoiceDate, po.vendor.creditDays);

  const result = await prisma.$transaction(async (tx) => {
    const gr = await tx.goodsReceipt.create({
      data: {
        grNumber,
        poId: data.poId,
        receivedDate: new Date(data.receivedDate),
        receivedBy: data.receivedBy,
        notes: data.notes,
        createdByName,
        createdById,
      },
    });

    const apNumber = await getNextAPNumber(tx);
    await tx.accountsPayable.create({
      data: {
        apNumber,
        vendorId: po.vendorId,
        poId: po.id,
        grId: gr.id,
        invoiceNumber: data.invoiceNumber,
        invoiceDate,
        dueDate,
        amount,
        vatAmount,
        totalAmount,
        createdByName,
        createdById,
      },
    });

    await tx.purchaseOrder.update({
      where: { id: data.poId },
      data: { status: "RECEIVED" },
    });

    return gr;
  });




  revalidatePath("/goods-receipts");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${data.poId}`);
  revalidatePath("/accounts-payable");
  return result;
}
