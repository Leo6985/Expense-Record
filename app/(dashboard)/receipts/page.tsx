import { getReceipts } from "@/actions/receipts";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default async function ReceiptsPage() {
  const receipts = await getReceipts();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รับชำระเงิน (ตัดชำระ)</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/receipts" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link
            href="/receipts/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + บันทึกการตัดชำระ
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่รับชำระ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">บัญชีที่รับเงิน</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ขาด/เกิน</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                receipts.map((r) => {
                  const s = statusConfig[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-700" };
                  const customerNames = [...new Set(r.items.map((i) => i.invoice.customer.name))].join(", ");
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/receipts/${r.id}`} className="font-mono text-blue-700 hover:underline">
                          {r.receiptNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(r.receiptDate)}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{customerNames}</td>
                      <td className="px-4 py-3 text-gray-600">{r.companyBankAccount.bankName} {r.companyBankAccount.accountNo}</td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(r.totalAmount)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${r.shortageOrExcessAmount === 0 ? "text-gray-400" : r.shortageOrExcessAmount > 0 ? "text-green-700" : "text-red-600"}`}>
                        {r.shortageOrExcessAmount === 0 ? "-" : `${r.shortageOrExcessAmount > 0 ? "+" : ""}฿${formatCurrency(r.shortageOrExcessAmount)}`}
                      </td>
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
