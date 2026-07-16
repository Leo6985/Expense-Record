import { getPaymentPreps } from "@/actions/payment-prep";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  PAID: { label: "จ่ายแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default async function PaymentPrepPage() {
  const preps = await getPaymentPreps();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ใบเตรียมจ่าย</h1>
        <Link
          href="/payment-prep/new"
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          + สร้างใบเตรียมจ่าย
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่เตรียม</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่กำหนดจ่าย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {preps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                preps.map((prep) => {
                  const s = statusConfig[prep.status] ?? { label: prep.status, color: "bg-gray-100 text-gray-700" };
                  const vendorNames = [...new Set(prep.items.map((i) => i.ap.vendor.name))].join(", ");
                  return (
                    <tr key={prep.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/payment-prep/${prep.id}`} className="font-mono text-blue-700 hover:underline">
                          {prep.prepNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(prep.prepDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(prep.paymentDate)}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{vendorNames}</td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(prep.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
                          {s.label}
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
