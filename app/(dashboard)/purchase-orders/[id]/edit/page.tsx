"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPurchaseOrder, updatePurchaseOrder } from "@/actions/purchase-orders";
import PurchaseOrderForm, { PurchaseOrderFormInitial } from "../../PurchaseOrderForm";

type PO = Awaited<ReturnType<typeof getPurchaseOrder>>;

export default function EditPurchaseOrderPage() {
  const params = useParams();
  const router = useRouter();
  const [po, setPO] = useState<PO>(null);

  useEffect(() => {
    getPurchaseOrder(params.id as string).then((data) => {
      if (!data) {
        router.replace("/purchase-orders");
        return;
      }
      if (data.status !== "DRAFT") {
        router.replace(`/purchase-orders/${data.id}`);
        return;
      }
      setPO(data);
    });
  }, [params.id, router]);

  if (!po) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const initialValues: PurchaseOrderFormInitial = {
    vendorId: po.vendorId,
    prNumber: po.prNumber ?? "",
    orderDate: po.orderDate.toISOString().split("T")[0],
    expectedDate: po.expectedDate ? po.expectedDate.toISOString().split("T")[0] : "",
    notes: po.notes ?? "",
    vatRate: String(po.vatRate),
    items: po.items.map((item) => ({
      productId: item.productId ?? "",
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit ?? "",
      unitPrice: String(item.unitPrice),
    })),
  };

  return (
    <PurchaseOrderForm
      title={`แก้ไขใบสั่งซื้อ ${po.poNumber}`}
      backHref={`/purchase-orders/${po.id}`}
      submitLabel="บันทึกการแก้ไข"
      savingLabel="กำลังบันทึก..."
      initialValues={initialValues}
      creatorLabel="ผู้จัดทำเดิม"
      creatorName={po.createdByName ?? ""}
      onSubmit={async (values) => {
        await updatePurchaseOrder(po.id, values);
        router.push(`/purchase-orders/${po.id}`);
      }}
    />
  );
}
