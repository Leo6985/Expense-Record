import { getPayments } from "@/actions/payments";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

export default async function PaymentsPage() {
  const payments = await getPayments();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">บันทึกการชำระเงิน</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">การชำระเงินเกิดจากการบันทึกในหน้า ใบเตรียมจ่าย หลังจากอนุมัติแล้ว</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่ชำระ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ใบเตรียมจ่าย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่ชำระ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วิธีการชำระ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">บัญชีที่ใช้จ่าย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขอ้างอิง</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">ยังไม่มีการชำระเงิน</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/payments/${payment.id}`} className="font-mono text-green-700 hover:underline">
                        {payment.paymentNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/payment-prep/${payment.prepId}`} className="font-mono text-blue-700 hover:underline">
                        {payment.prep.prepNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(payment.paymentDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{payment.paymentMethod}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {payment.companyBankAccount.bankName} {payment.companyBankAccount.accountNo}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-xs">{payment.referenceNumber || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">฿{formatCurrency(payment.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={6} className="px-4 py-3 text-right font-bold text-gray-900">รวมทั้งสิ้น</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700 text-base">
                    ฿{formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
