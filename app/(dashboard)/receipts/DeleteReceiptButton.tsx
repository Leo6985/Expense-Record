"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteReceipt } from "@/actions/receipts";

export default function DeleteReceiptButton({ receiptId, receiptNumber }: { receiptId: string; receiptNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบ "${receiptNumber}" ใช่หรือไม่? ไม่สามารถกู้คืนได้`)) return;
    setLoading(true);
    try {
      await deleteReceipt(receiptId);
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
