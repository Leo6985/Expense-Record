"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJournalVouchers } from "@/actions/journal-vouchers";
import { formatDate, formatCurrency } from "@/lib/utils";
import PageLoading from "@/components/PageLoading";
import DeleteJournalVoucherButton from "./DeleteJournalVoucherButton";

type Voucher = Awaited<ReturnType<typeof getJournalVouchers>>[number];

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
};

export default function JournalVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(q?: string) {
    setLoading(true);
    setVouchers(await getJournalVouchers(q));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สมุดรายวันทั่วไป</h1>
          <p className="text-gray-500 text-sm mt-0.5">บันทึกรายการปรับปรุง/รายการทั่วไปแบบเดบิต-เครดิต</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/export/journal-vouchers" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link href="/journal-vouchers/new" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
            + สร้างใบสำคัญ
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="ค้นหาด้วยเลขที่หรือรายละเอียด..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => load(search)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors">
          ค้นหา
        </button>
        {search && (
          <button onClick={() => { setSearch(""); load(); }} className="text-gray-400 hover:text-gray-600 text-sm px-2">ล้าง</button>
        )}
      </div>

      {loading ? (
        <PageLoading />
      ) : vouchers.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-16 bg-white rounded-xl border border-gray-200">ยังไม่มีใบสำคัญรายวัน</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">รายละเอียด</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const s = statusConfig[v.status] ?? { label: v.status, color: "bg-gray-100 text-gray-700" };
                  const balanced = Math.abs(v.totalDebit - v.totalCredit) < 0.01;
                  return (
                    <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/journal-vouchers/${v.id}`} className="font-mono text-blue-700 hover:underline">{v.voucherNumber}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(v.voucherDate)}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-md truncate">{v.description}</td>
                      <td className={`px-4 py-3 text-right font-medium ${balanced ? "" : "text-red-600"}`}>฿{formatCurrency(v.totalDebit)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {v.status === "DRAFT" && <DeleteJournalVoucherButton id={v.id} voucherNumber={v.voucherNumber} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
