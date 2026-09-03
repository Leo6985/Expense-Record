"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJournalVoucher } from "@/actions/journal-vouchers";

export default function DeleteJournalVoucherButton({ id, voucherNumber }: { id: string; voucherNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบใบสำคัญรายวัน "${voucherNumber}" ใช่หรือไม่? ไม่สามารถกู้คืนได้`)) return;
    setLoading(true);
    try {
      await deleteJournalVoucher(id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <button onClick={handleDelete} disabled={loading} className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50">
      ลบ
    </button>
  );
}
