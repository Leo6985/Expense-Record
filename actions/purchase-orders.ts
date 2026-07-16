"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

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
  });


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
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return updated;
}

export async function approvePurchaseOrder(id: string) {
  const session = await auth();
  const u = session?.user as { level?: string; role?: string; name?: string; id?: string } | undefined;
  if (u?.level !== "MANAGER" && u?.role !== "OWNER") throw new Error("เน€เธเธเธฒเธฐเธเธนเนเธเธฑเธ”เธเธฒเธฃเธซเธฃเธทเธญเน€เธเนเธฒเธเธญเธเน€เธ—เนเธฒเธเธฑเนเธเธ—เธตเนเธญเธเธธเธกเธฑเธ•เธดเนเธ”เน");

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "APPROVED", approvedByName: u?.name ?? "", approvedById: u?.id ?? "", approvedAt: new Date() },
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}

export async function deletePurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return;
  if (po.status !== "DRAFT") throw new Error("เธฅเธเนเธ”เนเน€เธเธเธฒเธฐ PO เธ—เธตเนเธขเธฑเธเน€เธเนเธเธฃเนเธฒเธเน€เธ—เนเธฒเธเธฑเนเธ");

  await prisma.purchaseOrder.delete({ where: { id } });

  revalidatePath("/purchase-orders");
}

export async function cancelPurchaseOrder(id: string) {
  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}
