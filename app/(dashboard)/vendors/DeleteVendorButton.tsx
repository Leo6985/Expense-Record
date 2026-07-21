"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVendor } from "@/actions/vendors";

export default function DeleteVendorButton({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`ลบผู้ขาย "${vendorName}" ใช่หรือไม่?`)) return;
    setLoading(true);
    try {
      await deleteVendor(vendorId);
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
