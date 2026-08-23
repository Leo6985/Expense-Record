"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSalesInvoice } from "@/actions/sales-invoices";

export default function DeleteInvoiceButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบใบกำกับภาษีขาย "${invoiceNumber}" ใช่หรือไม่? ไม่สามารถกู้คืนได้`)) return;
    setLoading(true);
    try {
      await deleteSalesInvoice(invoiceId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50"
    >
      ลบ
    </button>
  );
}
