"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { deletePayment } from "@/actions/payments";

export default function DeleteBtn({ paymentId, prepId }: { paymentId: string; prepId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";
  if (!isManager) return null;

  async function handleDelete() {
    if (!confirm("ยืนยันการลบการชำระเงินนี้? สถานะใบเตรียมจ่ายจะย้อนกลับเป็นอนุมัติแล้ว")) return;
    setLoading(true);
    try {
      await deletePayment(paymentId);
      router.push(`/payment-prep/${prepId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {loading ? "กำลังลบ..." : "ลบการชำระเงิน"}
    </button>
  );
}
