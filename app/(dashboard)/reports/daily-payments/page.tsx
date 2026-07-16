"use client";

import { useState } from "react";
import { getDailyPaymentsReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type Payment = Awaited<ReturnType<typeof getDailyPaymentsReport>>[number];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: "โอนเงิน",
  CHECK: "เช็ค",
  CASH: "เงินสด",
};

export default function DailyPaymentsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const data = await getDailyPaymentsReport(from, to);
    setPayments(data);
    setLoading(false);
  }

  const totalAmount = payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
  const totalWHT = payments?.reduce((s, p) => s + (p.prep.totalWithholdingTax ?? 0), 0) ?? 0;

  function handleDownloadCSV() {
    if (!payments || payments.length === 0) return;
    const headers = ["วันที่", "เลขที่ชำระ", "ผู้ขาย", "วิธีชำระ", "บัญชีที่ใช้จ่าย", "หัก ณ ที่จ่าย", "จำนวนเงิน"];
    const rows = payments.map((p) => {
      const vendors = [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", ");
      const wht = p.prep.totalWithholdingTax ?? 0;
      return [
        formatDate(p.paymentDate),
        p.paymentNumber,
        vendors,
        PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
        `${p.companyBankAccount.bankName} ${p.companyBankAccount.accountNo}`,
        wht > 0 ? wht : 0,
        p.amount,
      ];
    });
    downloadCSV(`รายการชำระเงิน_${from}_${to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายการการชำระเงินรายวัน</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ตั้งแต่วันที่</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ถึงวันที่</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "กำลังโหลด..." : "ค้นหา"}
        </button>
        {payments && payments.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {payments === null ? (
        <div className="text-center text-gray-400 text-sm py-12">กรุณากดค้นหาเพื่อดูรายงาน</div>
      ) : payments.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">ไม่พบรายการชำระเงินในช่วงเวลาที่เลือก</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">จำนวนรายการ</div>
              <div className="text-2xl font-bold text-blue-700">{payments.length}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <div className="text-xs text-red-600 mb-1">หัก ณ ที่จ่ายรวม</div>
              <div className="text-xl font-bold text-red-700">฿{formatCurrency(totalWHT)}</div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <div className="text-xs text-green-600 mb-1">ยอดชำระรวม</div>
              <div className="text-xl font-bold text-green-700">฿{formatCurrency(totalAmount)}</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันที่</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขที่ชำระ</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผู้ขาย</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">วิธีชำระ</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">บัญชีที่ใช้จ่าย</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">หัก ณ ที่จ่าย</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const vendors = [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", ");
                  const wht = p.prep.totalWithholdingTax ?? 0;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-4 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                      <td className="py-2.5 px-4 font-mono text-blue-700">{p.paymentNumber}</td>
                      <td className="py-2.5 px-4 text-gray-800">{vendors}</td>
                      <td className="py-2.5 px-4 text-gray-600">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                      <td className="py-2.5 px-4 text-gray-600 text-xs">
                        {p.companyBankAccount.bankName} {p.companyBankAccount.accountNo}
                      </td>
                      <td className="py-2.5 px-4 text-right text-red-600">
                        {wht > 0 ? `฿${formatCurrency(wht)}` : "-"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium">฿{formatCurrency(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={5} className="py-2.5 px-4 text-right text-gray-700">รวม</td>
                  <td className="py-2.5 px-4 text-right text-red-700">฿{formatCurrency(totalWHT)}</td>
                  <td className="py-2.5 px-4 text-right text-blue-700">฿{formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
