"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSalesInvoice } from "@/actions/sales-invoices";

export default function CancelInvoiceButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (!confirm(`ยืนยันการยกเลิกใบกำกับภาษีขาย "${invoiceNumber}" ใช่หรือไม่?`)) return;
    setLoading(true);
    try {
      await cancelSalesInvoice(invoiceId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50"
    >
      ยกเลิก
    </button>
  );
}
