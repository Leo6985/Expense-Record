import { getPayment } from "@/actions/payments";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintBtn from "./PrintBtn";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await getPayment(id);
  if (!payment) notFound();

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/payments" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{payment.paymentNumber}</h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">ชำระแล้ว</span>
        <PrintBtn />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลการชำระเงิน</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs text-gray-500">เลขที่ชำระ</div><div className="font-mono font-medium">{payment.paymentNumber}</div></div>
          <div><div className="text-xs text-gray-500">วันที่ชำระ</div><div className="font-medium">{formatDate(payment.paymentDate)}</div></div>
          <div><div className="text-xs text-gray-500">วิธีการชำระ</div><div className="font-medium">{payment.paymentMethod}</div></div>
          <div>
            <div className="text-xs text-gray-500">ใบเตรียมจ่าย</div>
            <Link href={`/payment-prep/${payment.prepId}`} className="font-mono text-blue-700 hover:underline">{payment.prep.prepNumber}</Link>
          </div>
          {payment.referenceNumber && (
            <div><div className="text-xs text-gray-500">เลขอ้างอิง</div><div className="font-mono font-medium">{payment.referenceNumber}</div></div>
          )}
          {payment.notes && (
            <div><div className="text-xs text-gray-500">หมายเหตุ</div><div className="font-medium">{payment.notes}</div></div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1">บัญชีบริษัทที่ใช้จ่าย</div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="font-medium">{payment.companyBankAccount.bankName} {payment.companyBankAccount.branch}</div>
            <div className="font-mono text-gray-700">{payment.companyBankAccount.accountNo} | {payment.companyBankAccount.accountName}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">รายการที่ชำระ</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 font-medium text-gray-600">เลข AP</th>
              <th className="text-left py-2 font-medium text-gray-600">ผู้ขาย</th>
              <th className="text-left py-2 font-medium text-gray-600">เลขใบแจ้งหนี้</th>
              <th className="text-right py-2 font-medium text-gray-600">จำนวนเงิน</th>
              <th className="text-right py-2 font-medium text-gray-600">หัก ณ ที่จ่าย</th>
              <th className="text-right py-2 font-medium text-gray-600">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {payment.prep.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50">
                <td className="py-2 font-mono text-blue-700">
                  <Link href={`/accounts-payable/${item.ap.id}`} className="hover:underline">{item.ap.apNumber}</Link>
                </td>
                <td className="py-2">{item.ap.vendor.name}</td>
                <td className="py-2 text-gray-600">{item.ap.invoiceNumber}</td>
                <td className="py-2 text-right">฿{formatCurrency(item.amount)}</td>
                <td className="py-2 text-right text-red-600">
                  {item.withholdingTaxRate > 0 ? `฿${formatCurrency(item.withholdingTaxAmount)}` : "-"}
                </td>
                <td className="py-2 text-right font-medium">฿{formatCurrency(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-3 text-right font-bold text-gray-900">รวมที่ชำระสุทธิ</td>
              <td className="pt-3 text-right font-bold text-green-700 text-lg">฿{formatCurrency(payment.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
