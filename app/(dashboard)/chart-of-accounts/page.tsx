"use client";

import { useState, useEffect } from "react";
import { getChartOfAccounts, deleteChartOfAccount } from "@/actions/chart-of-accounts";
import Link from "next/link";

type Account = Awaited<ReturnType<typeof getChartOfAccounts>>[number];

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ASSET:     { label: "สินทรัพย์",        color: "bg-blue-100 text-blue-700" },
  LIABILITY: { label: "หนี้สิน",          color: "bg-red-100 text-red-700" },
  EQUITY:    { label: "ส่วนของเจ้าของ",   color: "bg-purple-100 text-purple-700" },
  REVENUE:   { label: "รายได้",           color: "bg-green-100 text-green-700" },
  EXPENSE:   { label: "ค่าใช้จ่าย",       color: "bg-orange-100 text-orange-700" },
};

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(q?: string) {
    setLoading(true);
    const data = await getChartOfAccounts(q);
    setAccounts(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบบัญชี "${name}" ใช่หรือไม่?`)) return;
    try {
      await deleteChartOfAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ผังบัญชี</h1>
          <p className="text-gray-500 text-sm mt-0.5">กำหนดรหัสบัญชีสำหรับผูกกับสินค้าและบริการ</p>
        </div>
        <Link
          href="/chart-of-accounts/new"
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          + เพิ่มบัญชีใหม่
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="ค้นหาด้วยรหัสหรือชื่อบัญชี..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => load(search)}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors"
        >
          ค้นหา
        </button>
        {search && (
          <button onClick={() => { setSearch(""); load(); }} className="text-gray-400 hover:text-gray-600 text-sm px-2">
            ล้าง
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">กำลังโหลด...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-16 bg-white rounded-xl border border-gray-200">
          ยังไม่มีข้อมูลผังบัญชี
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">รหัสบัญชี</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ชื่อบัญชี</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ประเภท</th>
                <th className="text-center py-2.5 px-4 font-medium text-gray-600">สถานะ</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const t = TYPE_LABELS[a.type] ?? { label: a.type, color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-gray-800">{a.code}</td>
                    <td className="py-2.5 px-4 text-gray-800">{a.name}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {a.isActive ? "ใช้งาน" : "ปิดใช้"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link href={`/chart-of-accounts/${a.id}`} className="text-blue-600 hover:underline text-xs mr-3">แก้ไข</Link>
                      <button onClick={() => handleDelete(a.id, a.name)} className="text-red-500 hover:text-red-700 text-xs">ลบ</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
