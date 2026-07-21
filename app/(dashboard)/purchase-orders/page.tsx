import { getPurchaseOrders } from "@/actions/purchase-orders";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "รับแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const orders = await getPurchaseOrders(q, status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ใบสั่งซื้อ (PO)</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/purchase-orders" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link
            href="/purchase-orders/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เปิดใบสั่งซื้อ
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <form className="flex-1 flex gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาเลข PO, ชื่อผู้ขาย..."
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลข PO</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่สั่งซื้อ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่รับของ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">มูลค่า</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                orders.map((po) => {
                  const s = statusConfig[po.status] ?? { label: po.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/purchase-orders/${po.id}`} className="font-mono text-blue-700 hover:underline">
                          {po.poNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{po.vendor.name}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(po.orderDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(po.expectedDate)}</td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(po.totalAmount + po.vatAmount)}</td>
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
