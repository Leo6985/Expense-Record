import { getGoodsReceipts } from "@/actions/goods-receipts";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

export default async function GoodsReceiptsPage() {
  const receipts = await getGoodsReceipts();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รับสินค้า (GR)</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/goods-receipts" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link
            href="/goods-receipts/new"
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            + สร้างใบรับสินค้า
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่รับ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลข GR</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลข PO</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่ใบกำกับภาษี</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">มูลค่าใบรับ (รวม VAT)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้รับ</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    ยังไม่มีการรับสินค้า
                  </td>
                </tr>
              ) : (
                receipts.map((gr) => {
                  const ap = gr.accountsPayable[0];
                  return (
                    <tr key={gr.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(gr.receivedDate)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/goods-receipts/${gr.id}`} className="font-mono text-green-700 hover:underline">
                          {gr.grNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/purchase-orders/${gr.poId}`} className="font-mono text-blue-700 hover:underline">
                          {gr.po.poNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{gr.po.vendor.name}</td>
                      <td className="px-4 py-3 text-gray-600">{ap ? formatDate(ap.invoiceDate) : "-"}</td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(ap?.totalAmount ?? 0)}</td>
                      <td className="px-4 py-3 text-gray-600">{gr.receivedBy || "-"}</td>
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
