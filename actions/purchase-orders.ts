"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { purchaseOrdersTable, poItemsTable, PurchaseOrderRecord, POItemRecord } from "@/lib/sheets-tables";

/**
 * Postgres remains authoritative (GoodsReceipt/AccountsPayable still hold real FKs into
 * PurchaseOrder.id, and GoodsReceiptItem into POItem.id), so every write dual-writes into
 * the Google Sheet as a synced mirror. If the Sheet side fails, the Postgres write already
 * succeeded — surface the sync failure instead of silently losing it, but don't roll back
 * the Postgres write.
 */
export async function syncPOToSheet(po: {
  id: string;
  poNumber: string;
  prNumber: string | null;
  vendorId: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: string;
  totalAmount: number;
  vatRate: number;
  vatAmount: number;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: PurchaseOrderRecord = { ...po };
  try {
    await purchaseOrdersTable.update(po.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await purchaseOrdersTable.create(record);
    } else {
      throw err;
    }
  }
}

async function syncPOItemsToSheet(poId: string, items: POItemRecord[]) {
  await poItemsTable.replaceWhere((r) => r.poId === poId, items);
}

export async function getPurchaseOrders(search?: string, status?: string) {
  return prisma.purchaseOrder.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { poNumber: { contains: search, mode: "insensitive" } },
              { vendor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAdjacentPurchaseOrderIds(id: string) {
  const rows = await prisma.purchaseOrder.findMany({
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

export async function getPurchaseOrder(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      items: true,
      goodsReceipts: true,
    },
  });
}

export async function getNextPONumber() {
  const year = String(new Date().getFullYear() + 543).slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `PO${year}${month}`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: "desc" },
  });
  const lastSeq = last ? parseInt(last.poNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function createPurchaseOrder(data: {
  vendorId: string;
  prNumber?: string;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  vatRate?: number;
  items: {
    productId?: string;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
  }[];
}) {
  const session = await auth();
  const createdByName = (session?.user as { name?: string })?.name ?? "";
  const createdById = (session?.user as { id?: string })?.id ?? "";

  const poNumber = await getNextPONumber();
  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const vatRate = data.vatRate ?? 7;
  const vatAmount = totalAmount * (vatRate / 100);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      prNumber: data.prNumber || null,
      vendorId: data.vendorId,
      orderDate: new Date(data.orderDate),
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      totalAmount,
      vatRate,
      vatAmount,
      notes: data.notes,
      createdByName,
      createdById,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId || null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      },
    },
    include: { items: true },
  });
  await syncPOToSheet(po);
  await syncPOItemsToSheet(po.id, po.items);

  revalidatePath("/purchase-orders");
  return po;
}

export async function updatePurchaseOrder(
  id: string,
  data: {
    vendorId: string;
    prNumber?: string;
    orderDate: string;
    expectedDate?: string;
    notes?: string;
    vatRate?: number;
    items: {
      productId?: string;
      description: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
    }[];
  }
) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new Error("ไม่พบใบสั่งซื้อ");
  if (po.status !== "DRAFT") throw new Error("แก้ไขได้เฉพาะ PO ที่ยังเป็นร่างเท่านั้น");

  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const vatRate = data.vatRate ?? po.vatRate;
  const vatAmount = totalAmount * (vatRate / 100);

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      prNumber: data.prNumber || null,
      vendorId: data.vendorId,
      orderDate: new Date(data.orderDate),
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      totalAmount,
      vatRate,
      vatAmount,
      notes: data.notes,
      items: {
        deleteMany: {},
        create: data.items.map((item) => ({
          productId: item.productId || null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      },
    },
    include: { items: true },
  });
  await syncPOToSheet(updated);
  await syncPOItemsToSheet(id, updated.items);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return updated;
}

export async function approvePurchaseOrder(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่อนุมัติได้");

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
  });
  await syncPOToSheet(po);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}

export async function unapprovePurchaseOrder(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เฉพาะผู้จัดการหรือเจ้าของเท่านั้นที่ยกเลิกการอนุมัติได้");

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { goodsReceipts: true },
  });
  if (!po) throw new Error("ไม่พบใบสั่งซื้อ");
  if (po.status !== "APPROVED") throw new Error("ยกเลิกอนุมัติได้เฉพาะ PO ที่อนุมัติแล้วเท่านั้น");
  if (po.goodsReceipts.length > 0) throw new Error("ไม่สามารถยกเลิกอนุมัติได้ เนื่องจากมีการรับสินค้าแล้ว กรุณาลบใบรับสินค้าก่อน");

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null },
  });
  await syncPOToSheet(updated);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}

export async function deletePurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return;
  if (po.status !== "DRAFT") throw new Error("ลบได้เฉพาะ PO ที่ยังเป็นร่างเท่านั้น");

  await prisma.purchaseOrder.delete({ where: { id } });
  await purchaseOrdersTable.delete(id);
  await poItemsTable.deleteWhere((r) => r.poId === id);

  revalidatePath("/purchase-orders");
}

export async function cancelPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await syncPOToSheet(po);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}
