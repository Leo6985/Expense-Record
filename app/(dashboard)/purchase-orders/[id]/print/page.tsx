import { getPurchaseOrder } from "@/actions/purchase-orders";
import { formatDate, formatCurrency } from "@/lib/utils";
import { notFound } from "next/navigation";
import AutoPrint from "./PrintButton";

export default async function POPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const fmt = (d: Date | null | undefined) =>
    d ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", calendar: "gregory" }).format(new Date(d)) : null;

  const docDate = fmt(po.createdAt) ?? formatDate(po.orderDate);
  const createdDate = fmt(po.createdAt);
  const approvedDate = fmt(po.approvedAt ?? (po.approvedByName ? po.updatedAt : null));

  return (
    <div className="print-page bg-white">
      <AutoPrint />

      <div className="max-w-4xl mx-auto px-10 py-8">

        {/* Header: company left, document title right */}
        <div className="flex items-start justify-between mb-8 pb-5 border-b-2 border-gray-800">
          <div>
            <div className="text-base font-bold text-gray-900 leading-snug">
              บริษัท เคมเทค อินโนเวชั่น จำกัด
            </div>
            <div className="text-xs text-gray-600 mt-1 leading-relaxed">
              333/37 หมู่ 2 ต.มาบยางพร อ.ปลวกแดง จ.ระยอง 21140
            </div>
            <div className="text-xs text-gray-600">
              เลขประจำตัวผู้เสียภาษี 0205555008617
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              โทร 033-650-796 &nbsp;|&nbsp; purchase@chemtech-th.com
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 tracking-wide">ใบสั่งซื้อ</div>
            <div className="text-sm text-gray-500 mt-0.5">Purchase Order</div>
            <div className="mt-2 text-sm">
              <span className="text-gray-500">เลขที่ </span>
              <span className="font-bold font-mono text-blue-700">{po.poNumber}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">วันที่ </span>
              <span className="font-medium">{docDate}</span>
            </div>
          </div>
        </div>

        {/* Vendor & order info */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="border border-gray-300 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ผู้ขาย</div>
            <div className="font-semibold text-gray-900">{po.vendor.name}</div>
            {po.vendor.address && (
              <div className="text-gray-600 text-xs mt-1 leading-relaxed">{po.vendor.address}</div>
            )}
            {po.vendor.taxId && (
              <div className="text-gray-500 text-xs mt-1">เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{po.vendor.taxId}</span></div>
            )}
            {po.vendor.phone && (
              <div className="text-gray-500 text-xs mt-0.5">โทร: {po.vendor.phone}</div>
            )}
          </div>

          <div className="border border-gray-300 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">รายละเอียดคำสั่งซื้อ</div>
            <div className="space-y-1.5">
              {po.prNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-500">เลขที่ใบขอซื้อ (PR)</span>
                  <span className="font-mono font-semibold text-gray-800">{po.prNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">วันที่สั่งซื้อ</span>
                <span className="font-medium">{docDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">กำหนดส่งของ</span>
                <span className="font-medium">{formatDate(po.expectedDate)}</span>
              </div>
              {po.notes && (
                <div className="pt-1 border-t border-gray-100">
                  <span className="text-gray-500 block text-xs mb-0.5">หมายเหตุ</span>
                  <span className="text-gray-700">{po.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide w-8 border border-gray-700">ลำดับ</th>
              <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide border border-gray-700">รายการสินค้า/บริการ</th>
              <th className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-20 border border-gray-700">จำนวน</th>
              <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide w-14 border border-gray-700">หน่วย</th>
              <th className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-28 border border-gray-700">ราคา/หน่วย</th>
              <th className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-28 border border-gray-700">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                <td className="border border-gray-300 px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                <td className="border border-gray-300 px-3 py-2">{item.description}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(item.quantity)}</td>
                <td className="border border-gray-300 px-3 py-2 text-gray-600">{item.unit ?? "-"}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-gray-300 px-3 py-2 text-right text-gray-600 bg-gray-50">
                ยอดก่อน VAT
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right text-gray-700 bg-gray-50">
                {formatCurrency(po.totalAmount)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="border border-gray-300 px-3 py-2 text-right text-gray-600 bg-gray-50">
                VAT {po.vatRate}%
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right text-gray-700 bg-gray-50">
                {formatCurrency(po.vatAmount)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="border border-gray-300 px-3 py-2.5 text-right font-semibold text-gray-700 bg-gray-50">
                ยอดรวมทั้งสิ้น
              </td>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-bold text-blue-700 bg-gray-50 text-base">
                {formatCurrency(po.totalAmount + po.vatAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-16 mt-12 text-sm text-center">
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้จัดทำ</div>
            <div className="text-gray-800 mt-1">{po.createdByName || "................................"}</div>
            <div className="text-gray-500 text-xs mt-1">{createdDate ?? "..................."}</div>
          </div>
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้อนุมัติ</div>
            <div className="text-gray-800 mt-1">{po.approvedByName || "................................"}</div>
            <div className="text-gray-500 text-xs mt-1">{approvedDate ?? "..................."}</div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        @media print {
          aside { display: none !important; }
          html, body, main { background-color: white !important; }
          main { margin-left: 0 !important; }
          main > div { padding: 0 !important; background-color: white !important; }
          html, body {
            width: 210mm;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
