"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChartOfAccount } from "@/actions/chart-of-accounts";
import Link from "next/link";

const TYPES = [
  { value: "ASSET",     label: "สินทรัพย์" },
  { value: "LIABILITY", label: "หนี้สิน" },
  { value: "EQUITY",    label: "ส่วนของเจ้าของ" },
  { value: "REVENUE",   label: "รายได้" },
  { value: "EXPENSE",   label: "ค่าใช้จ่าย" },
];

export default function NewChartOfAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await createChartOfAccount({
        code: form.get("code") as string,
        name: form.get("name") as string,
        type: form.get("type") as string,
      });
      router.push("/chart-of-accounts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/chart-of-accounts" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มบัญชีใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสบัญชี *</label>
            <input
              name="code"
              required
              placeholder="เช่น 5101"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทบัญชี *</label>
            <select
              name="type"
              required
              defaultValue="EXPENSE"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบัญชี *</label>
          <input
            name="name"
            required
            placeholder="เช่น ค่าวัสดุสิ้นเปลือง"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <Link href="/chart-of-accounts" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
