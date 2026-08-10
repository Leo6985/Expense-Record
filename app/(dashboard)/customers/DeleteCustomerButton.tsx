"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomer } from "@/actions/customers";

export default function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบลูกค้า "${customerName}" ใช่หรือไม่?`)) return;
    setLoading(true);
    try {
      await deleteCustomer(customerId);
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
