"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccountsPayable } from "@/actions/accounts-payable";

export default function DeleteAPButton({ apId, apNumber }: { apId: string; apNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบใบตั้งหนี้ "${apNumber}" ใช่หรือไม่? ไม่สามารถกู้คืนได้`)) return;
    setLoading(true);
    try {
      await deleteAccountsPayable(apId);
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
