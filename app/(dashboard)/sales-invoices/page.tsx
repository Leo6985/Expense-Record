import { getSalesInvoices } from "@/actions/sales-invoices";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import SalesInvoiceCsvImport from "./SalesInvoiceCsvImport";
import CancelInvoiceButton from "./CancelInvoiceButton";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอรับชำระ", color: "bg-yellow-100 text-yellow-700" },
  PARTIALLY_RECEIVED: { label: "รับชำระบางส่วน", color: "bg-purple-100 text-purple-700" },
  RECEIVED: { label: "รับชำระครบแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default async function SalesInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const invoices = await getSalesInvoices(q, status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ใบกำกับภาษีขาย</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/sales-invoices" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <SalesInvoiceCsvImport />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <form className="flex-1 flex gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาเลขที่ใบกำกับภาษี, ชื่อลูกค้า..."
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่ใบกำกับภาษี</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">ส่วนลด</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">กำหนดชำระ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const s = statusConfig[inv.status] ?? { label: inv.status, color: "bg-gray-100 text-gray-700" };
                  const isOverdue = (inv.status === "PENDING" || inv.status === "PARTIALLY_RECEIVED") && new Date(inv.dueDate) < new Date();
                  return (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/sales-invoices/${inv.id}`} className="font-mono text-blue-700 hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{inv.customer.name}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {inv.discountAmount > 0 ? `฿${formatCurrency(inv.discountAmount)}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(inv.totalAmount)}</td>
                      <td className={`px-4 py-3 ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                        {formatDate(inv.dueDate)}
                        {isOverdue && " ⚠️"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isOverdue ? "bg-red-100 text-red-700" : s.color}`}>
                          {isOverdue ? "เกินกำหนด" : s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.status === "PENDING" && (
                          <CancelInvoiceButton invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} />
                        )}
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
