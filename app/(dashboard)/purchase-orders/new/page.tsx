"use client";

import { useRouter } from "next/navigation";
import { createPurchaseOrder } from "@/actions/purchase-orders";
import PurchaseOrderForm from "../PurchaseOrderForm";

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  return (
    <PurchaseOrderForm
      title="เปิดใบสั่งซื้อใหม่"
      backHref="/purchase-orders"
      submitLabel="สร้างใบสั่งซื้อ"
      savingLabel="กำลังบันทึก..."
      onSubmit={async (values) => {
        await createPurchaseOrder(values);
        router.push("/purchase-orders");
      }}
    />
  );
}
