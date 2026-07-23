import { getPaymentPrep } from "@/actions/payment-prep";
import { formatCurrency } from "@/lib/utils";
import { notFound } from "next/navigation";
import AutoPrint from "./PrintButton";

export default async function PaymentPrepPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prep = await getPaymentPrep(id);
  if (!prep) notFound();

  const fmt = (d: Date | null | undefined) =>
    d ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : null;

  const docDate = fmt(prep.createdAt);
  const createdDate = fmt(prep.createdAt);
  const approvedDate = fmt(prep.approvedAt ?? (prep.approvedByName ? prep.updatedAt : null));

  return (
    <div className="bg-white">
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
            <div className="text-2xl font-bold text-gray-900 tracking-wide">ใบเตรียมจ่ายเงิน</div>
            <div className="text-sm text-gray-500 mt-0.5">Payment Preparation Slip</div>
            <div className="mt-2 text-sm">
              <span className="text-gray-500">เลขที่ </span>
              <span className="font-bold font-mono text-blue-700">{prep.prepNumber}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">วันที่ </span>
              <span className="font-medium">{docDate}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">กำหนดจ่าย </span>
              <span className="font-medium">{fmt(prep.paymentDate)}</span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="border border-gray-700 px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide">ผู้ขาย</th>
              <th className="border border-gray-700 px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide w-32">เลขที่ใบแจ้งหนี้</th>
              <th className="border border-gray-700 px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide w-28">ใบสั่งซื้อ (PO)</th>
              <th className="border border-gray-700 px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-26">จำนวนเงิน</th>
              <th className="border border-gray-700 px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-26">หัก ณ ที่จ่าย</th>
              <th className="border border-gray-700 px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide w-26">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {prep.items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                <td className="border border-gray-300 px-3 py-2 font-medium">{item.ap.vendor.name}</td>
                <td className="border border-gray-300 px-3 py-2 font-mono text-xs">{item.ap.invoiceNumber}</td>
                <td className="border border-gray-300 px-3 py-2 font-mono text-xs">{item.ap.po?.poNumber ?? "-"}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(item.amount)}</td>
                <td className="border border-gray-300 px-3 py-2 text-right text-xs">
                  {item.withholdingTaxRate > 0
                    ? `${item.withholdingTaxRate}% / ${formatCurrency(item.withholdingTaxAmount)}`
                    : "-"}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right font-medium">{formatCurrency(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={3} className="border border-gray-300 px-3 py-2.5 text-right font-semibold text-gray-700">ยอดรวม</td>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-medium">{formatCurrency(prep.totalAmount)}</td>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-medium text-red-700">{formatCurrency(prep.totalWithholdingTax)}</td>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-medium">{formatCurrency(prep.netPayableAmount)}</td>
            </tr>
            <tr className="bg-gray-100">
              <td colSpan={5} className="border border-gray-300 px-3 py-2.5 text-right font-bold text-gray-700">ยอดที่ต้องจ่ายสุทธิ</td>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-bold text-blue-700 text-base">{formatCurrency(prep.netPayableAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Destination bank accounts — listed vertically, in table row order */}
        <div className="mb-6">
          <div className="font-semibold text-gray-800 mb-2 text-sm border-b border-gray-300 pb-1">บัญชีปลายทางสำหรับโอนเงิน</div>
          <div className="space-y-1.5 text-sm">
            {prep.items.map((item, idx) => (
              <div key={item.id} className="flex items-baseline justify-between gap-4 border-b border-dashed border-gray-200 pb-1.5">
                <span className="text-gray-800">
                  <span className="text-gray-400 mr-1">{idx + 1}.</span>
                  {item.ap.vendor.bankAccountName ?? "-"}
                </span>
                <span className="text-gray-600 font-mono text-xs">{item.ap.vendor.bankAccountNo ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notes — blank space for handwritten remarks */}
        <div className="mb-6">
          <div className="font-semibold text-gray-800 mb-2 text-sm">หมายเหตุ</div>
          <div className="border border-gray-300 rounded-lg p-3 min-h-20 text-sm text-gray-600">
            {prep.notes}
          </div>
        </div>

        {/* Payment info */}
        {prep.payment && (
          <div className="border border-gray-300 rounded-lg p-4 mb-6 bg-green-50">
            <div className="font-semibold text-gray-800 mb-3 text-sm">ข้อมูลการชำระเงิน</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="flex gap-2">
                <span className="text-gray-500 w-28">เลขที่ชำระ</span>
                <span className="font-mono font-medium">{prep.payment.paymentNumber}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-28">วันที่ชำระ</span>
                <span className="font-medium">{fmt(prep.payment.paymentDate)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-28">วิธีชำระ</span>
                <span className="font-medium">{prep.payment.paymentMethod}</span>
              </div>
              {prep.payment.referenceNumber && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28">เลขอ้างอิง</span>
                  <span className="font-mono font-medium">{prep.payment.referenceNumber}</span>
                </div>
              )}
              <div className="col-span-2 flex gap-2">
                <span className="text-gray-500 w-28">บัญชีที่ใช้จ่าย</span>
                <span className="font-medium">
                  {prep.payment.companyBankAccount.bankName} {prep.payment.companyBankAccount.accountNo}{" "}
                  {prep.payment.companyBankAccount.accountName}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Signatures — same style as PO */}
        <div className="grid grid-cols-2 gap-16 mt-12 text-sm text-center">
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้จัดทำ</div>
            <div className="text-gray-800 mt-1">{prep.createdByName || "................................"}</div>
            <div className="text-gray-500 text-xs mt-1">{createdDate ?? "..................."}</div>
          </div>
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้อนุมัติ</div>
            <div className="text-gray-800 mt-1">{prep.approvedByName || "................................"}</div>
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
