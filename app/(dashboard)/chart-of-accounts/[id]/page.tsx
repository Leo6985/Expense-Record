"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getChartOfAccount, updateChartOfAccount } from "@/actions/chart-of-accounts";
import Link from "next/link";
import PageLoading from "@/components/PageLoading";

type Account = Awaited<ReturnType<typeof getChartOfAccount>>;

const TYPES = [
  { value: "ASSET",     label: "สินทรัพย์" },
  { value: "LIABILITY", label: "หนี้สิน" },
  { value: "EQUITY",    label: "ส่วนของเจ้าของ" },
  { value: "REVENUE",   label: "รายได้" },
  { value: "EXPENSE",   label: "ค่าใช้จ่าย" },
];

export default function EditChartOfAccountPage() {
  const params = useParams();
  const router = useRouter();
  const [account, setAccount] = useState<Account>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getChartOfAccount(params.id as string).then(setAccount);
  }, [params.id]);

  if (!account) return <PageLoading />;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await updateChartOfAccount(account!.id, {
        code: form.get("code") as string,
        name: form.get("name") as string,
        type: form.get("type") as string,
        isActive: form.get("isActive") === "true",
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
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขผังบัญชี</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสบัญชี *</label>
            <input
              name="code"
              required
              defaultValue={account.code}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทบัญชี *</label>
            <select
              name="type"
              required
              defaultValue={account.type}
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
            defaultValue={account.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
          <select
            name="isActive"
            defaultValue={account.isActive ? "true" : "false"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="true">ใช้งาน</option>
            <option value="false">ปิดใช้</option>
          </select>
        </div>

        {account.products.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            สินค้าที่ใช้บัญชีนี้: {account.products.map((p) => p.name).join(", ")}
          </div>
        )}

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
