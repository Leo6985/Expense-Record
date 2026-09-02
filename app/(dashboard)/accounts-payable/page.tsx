import { getAccountsPayable } from "@/actions/accounts-payable";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import AccountsPayableCsvImport from "./AccountsPayableCsvImport";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอดำเนินการ", color: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  PAYMENT_PREP: { label: "เตรียมจ่าย", color: "bg-purple-100 text-purple-700" },
  PAID: { label: "จ่ายแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default async function AccountsPayablePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const aps = await getAccountsPayable(q, status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ตั้งหนี้ (AP)</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/accounts-payable" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <AccountsPayableCsvImport />
          <Link
            href="/accounts-payable/new-resale"
            className="border border-blue-700 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            + สินค้า/บริการซื้อมาเพื่อขาย
          </Link>
          <Link
            href="/accounts-payable/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + ตั้งหนี้ใหม่
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <form className="flex-1 flex gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาเลขที่ AP, เลขที่ใบแจ้งหนี้, ชื่อผู้ขาย..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              name="status"
              defaultValue={status ?? ""}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกสถานะ</option>
              {Object.entries(statusConfig).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <button type="submit" className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
              ค้นหา
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่ AP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่ใบแจ้งหนี้</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่ใบแจ้งหนี้</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">หมวดบัญชี</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันครบกำหนด</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {aps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                aps.map((ap) => {
                  const s = statusConfig[ap.status] ?? { label: ap.status, color: "bg-gray-100 text-gray-700" };
                  const isOverdue = ap.status === "PENDING" && new Date(ap.dueDate) < new Date();
                  return (
                    <tr key={ap.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/accounts-payable/${ap.id}`} className="font-mono text-blue-700 hover:underline">
                          {ap.apNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(ap.invoiceDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{ap.invoiceNumber}</td>
                      <td className="px-4 py-3 font-medium">{ap.vendor.name}</td>
                      <td className="px-4 py-3 text-gray-600">{ap.account?.name ?? "-"}</td>
                      <td className={`px-4 py-3 ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                        {formatDate(ap.dueDate)}
                        {isOverdue && " ⚠️"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(ap.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isOverdue ? "bg-red-100 text-red-700" : s.color}`}>
                          {isOverdue ? "เกินกำหนด" : s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
