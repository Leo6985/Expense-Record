"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { addDays } from "date-fns";

const QTY_TOLERANCE = 0.0001;

export async function getGoodsReceipts() {
  return prisma.goodsReceipt.findMany({
    include: {
      po: {
        include: { vendor: { select: { name: true } } },
      },
      accountsPayable: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGoodsReceipt(id: string) {
  return prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      po: { include: { vendor: true, items: true } },
      items: { include: { poItem: true } },
      accountsPayable: {
        include: {
          paymentPrepItems: { include: { prep: true } },
        },
      },
    },
  });
}

export async function getGoodsReceiptForEdit(id: string) {
  const gr = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      po: {
        include: {
          vendor: true,
          items: { include: { goodsReceiptItems: true } },
        },
      },
      items: true,
      accountsPayable: {
        include: { paymentPrepItems: { include: { prep: true } } },
      },
    },
  });
  if (!gr) return null;

  return {
    ...gr,
    po: {
      ...gr.po,
      items: gr.po.items.map((item) => {
        const receivedByOthers = item.goodsReceiptItems
          .filter((gri) => gri.grId !== id)
          .reduce((s, gri) => s + gri.quantity, 0);
        return { ...item, receivedByOthers, outstandingForThisGR: Math.max(0, item.quantity - receivedByOthers) };
      }),
    },
  };
}

// POs still open for receiving, with each item's already-received quantity
// (across all of that PO's goods receipts) so the UI can show what's outstanding.
export async function getApprovedPOsForGR() {
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
    include: {
      vendor: true,
      items: { include: { goodsReceiptItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return pos.map((po) => ({
    ...po,
    items: po.items.map((item) => {
      const receivedQuantity = item.goodsReceiptItems.reduce((s, gri) => s + gri.quantity, 0);
      return {
        ...item,
        receivedQuantity,
        outstandingQuantity: Math.max(0, item.quantity - receivedQuantity),
      };
    }),
  }));
}

export async function getNextGRNumber() {
  const count = await prisma.goodsReceipt.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `GR${year}${month}${String(count + 1).padStart(4, "0")}`;
}

async function getNextAPNumber(tx: Prisma.TransactionClient) {
  const count = await tx.accountsPayable.count();
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `AP${year}${month}${String(count + 1).padStart(4, "0")}`;
}

async function recomputePOStatus(tx: Prisma.TransactionClient, poId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: { items: { include: { goodsReceiptItems: true } } },
  });
  if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED" && po.status !== "RECEIVED") return;

  let anyReceived = false;
  let fullyReceived = true;
  for (const item of po.items) {
    const received = item.goodsReceiptItems.reduce((s, gri) => s + gri.quantity, 0);
    if (received > QTY_TOLERANCE) anyReceived = true;
    if (received < item.quantity - QTY_TOLERANCE) fullyReceived = false;
  }

  const newStatus = fullyReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "APPROVED";
  if (newStatus !== po.status) {
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus } });
  }
}

// Blocks edit/delete once the linked AP has moved into an active payment prep or been paid.
function assertGREditable(ap: { status: string; paymentPrepItems: { prep: { status: string } }[] } | null) {
  if (!ap) return;
  const hasActivePrep = ap.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED");
  if (hasActivePrep) {
    throw new Error("ไม่สามารถแก้ไข/ลบใบรับสินค้าได้ เนื่องจากหนี้ที่ตั้งไว้ถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว");
  }
}

export async function deleteGoodsReceipt(id: string) {
  const gr = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: { accountsPayable: { include: { paymentPrepItems: { include: { prep: true } } } } },
  });
  if (!gr) return;
  for (const ap of gr.accountsPayable) assertGREditable(ap);

  await prisma.$transaction(async (tx) => {
    await tx.goodsReceipt.delete({ where: { id } });
    await recomputePOStatus(tx, gr.poId);
  });

  revalidatePath("/goods-receipts");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${gr.poId}`);
  revalidatePath("/accounts-payable");
}

export async function createGoodsReceipt(data: {
  poId: string;
  receivedDate: string;
  receivedBy?: string;
  notes?: string;
  invoiceNumber: string;
  invoiceDate: string;
  vatAmount?: number;
  items: { poItemId: string; quantity: number }[];
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const grNumber = await getNextGRNumber();

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: data.poId },
    include: { vendor: true, items: { include: { goodsReceiptItems: true } } },
  });

  const receiveItems = data.items.filter((i) => i.quantity > QTY_TOLERANCE);
  if (receiveItems.length === 0) throw new Error("กรุณาระบุจำนวนที่รับอย่างน้อย 1 รายการ");

  const lineItems = receiveItems.map((ri) => {
    const poItem = po.items.find((i) => i.id === ri.poItemId);
    if (!poItem) throw new Error("ไม่พบรายการสินค้าในใบสั่งซื้อ");
    const alreadyReceived = poItem.goodsReceiptItems.reduce((s, gri) => s + gri.quantity, 0);
    const outstanding = poItem.quantity - alreadyReceived;
    if (ri.quantity > outstanding + QTY_TOLERANCE) {
      throw new Error(`จำนวนที่รับ (${ri.quantity}) เกินกว่าจำนวนคงเหลือของ "${poItem.description}" (${outstanding})`);
    }
    return { poItemId: poItem.id, quantity: ri.quantity, unitPrice: poItem.unitPrice, totalPrice: ri.quantity * poItem.unitPrice };
  });

  const vatAmount = data.vatAmount ?? 0;
  const amount = lineItems.reduce((s, i) => s + i.totalPrice, 0);
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
        items: { create: lineItems },
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

    await recomputePOStatus(tx, data.poId);

    return gr;
  });

  revalidatePath("/goods-receipts");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${data.poId}`);
  revalidatePath("/accounts-payable");
  return result;
}

export async function updateGoodsReceipt(
  id: string,
  data: {
    receivedDate: string;
    receivedBy?: string;
    notes?: string;
    invoiceNumber: string;
    invoiceDate: string;
    vatAmount?: number;
    items: { poItemId: string; quantity: number }[];
  }
) {
  const gr = await prisma.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: {
      po: { include: { vendor: true, items: { include: { goodsReceiptItems: true } } } },
      accountsPayable: { include: { paymentPrepItems: { include: { prep: true } } } },
    },
  });
  for (const ap of gr.accountsPayable) assertGREditable(ap);

  const receiveItems = data.items.filter((i) => i.quantity > QTY_TOLERANCE);
  if (receiveItems.length === 0) throw new Error("กรุณาระบุจำนวนที่รับอย่างน้อย 1 รายการ");

  const lineItems = receiveItems.map((ri) => {
    const poItem = gr.po.items.find((i) => i.id === ri.poItemId);
    if (!poItem) throw new Error("ไม่พบรายการสินค้าในใบสั่งซื้อ");
    // Exclude this GR's own current quantity from "already received" so it can be adjusted freely up to the PO line's ordered quantity.
    const receivedByOthers = poItem.goodsReceiptItems
      .filter((gri) => gri.grId !== id)
      .reduce((s, gri) => s + gri.quantity, 0);
    const outstanding = poItem.quantity - receivedByOthers;
    if (ri.quantity > outstanding + QTY_TOLERANCE) {
      throw new Error(`จำนวนที่รับ (${ri.quantity}) เกินกว่าจำนวนคงเหลือของ "${poItem.description}" (${outstanding})`);
    }
    return { poItemId: poItem.id, quantity: ri.quantity, unitPrice: poItem.unitPrice, totalPrice: ri.quantity * poItem.unitPrice };
  });

  const vatAmount = data.vatAmount ?? 0;
  const amount = lineItems.reduce((s, i) => s + i.totalPrice, 0);
  const totalAmount = amount + vatAmount;
  const invoiceDate = new Date(data.invoiceDate);
  const dueDate = addDays(invoiceDate, gr.po.vendor.creditDays);

  await prisma.$transaction(async (tx) => {
    await tx.goodsReceipt.update({
      where: { id },
      data: {
        receivedDate: new Date(data.receivedDate),
        receivedBy: data.receivedBy,
        notes: data.notes,
        items: {
          deleteMany: {},
          create: lineItems,
        },
      },
    });

    const ap = gr.accountsPayable[0];
    if (ap) {
      await tx.accountsPayable.update({
        where: { id: ap.id },
        data: {
          invoiceNumber: data.invoiceNumber,
          invoiceDate,
          dueDate,
          amount,
          vatAmount,
          totalAmount,
        },
      });
    }

    await recomputePOStatus(tx, gr.poId);
  });

  revalidatePath("/goods-receipts");
  revalidatePath(`/goods-receipts/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${gr.poId}`);
  revalidatePath("/accounts-payable");
}
