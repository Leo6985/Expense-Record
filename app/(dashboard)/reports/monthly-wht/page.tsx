"use client";

import { useState } from "react";
import { getMonthlyWithholdingTaxReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type Item = Awaited<ReturnType<typeof getMonthlyWithholdingTaxReport>>[number];

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function MonthlyWithholdingTaxPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const data = await getMonthlyWithholdingTaxReport(year, month);
    setItems(data);
    setLoading(false);
  }

  const totalAmount = items?.reduce((s, i) => s + i.amount, 0) ?? 0;
  const totalWHT = items?.reduce((s, i) => s + i.withholdingTaxAmount, 0) ?? 0;
  const totalNet = items?.reduce((s, i) => s + i.netAmount, 0) ?? 0;

  // Group by vendor
  const byVendor = (items ?? []).reduce<Record<string, { name: string; taxId: string; count: number; amount: number; wht: number }>>((acc, i) => {
    const key = i.ap.vendorId;
    if (!acc[key]) acc[key] = { name: i.ap.vendor.name, taxId: i.ap.vendor.taxId ?? "-", count: 0, amount: 0, wht: 0 };
    acc[key].count++;
    acc[key].amount += i.amount;
    acc[key].wht += i.withholdingTaxAmount;
    return acc;
  }, {});

  function handleDownloadCSV() {
    if (!items || items.length === 0) return;
    const headers = ["วันที่จ่าย", "เลขที่ชำระ", "ผู้ขาย", "เลขประจำตัวผู้เสียภาษี", "เลขใบแจ้งหนี้", "จำนวนเงินที่จ่าย", "อัตราหัก (%)", "ภาษีหัก ณ ที่จ่าย", "สุทธิ"];
    const rows = items.map((i) => [
      formatDate(i.prep.payment.paymentDate),
      i.prep.payment.paymentNumber,
      i.ap.vendor.name,
      i.ap.vendor.taxId ?? "",
      i.ap.invoiceNumber,
      i.amount,
      i.withholdingTaxRate,
      i.withholdingTaxAmount,
      i.netAmount,
    ]);
    downloadCSV(`รายงานหัก ณ ที่จ่าย_${year}_${String(month).padStart(2, "0")}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายงานหัก ณ ที่จ่าย ประจำเดือน</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เดือน</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ปี (พ.ศ.)</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "กำลังโหลด..." : "ค้นหา"}
        </button>
        {items && items.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {items === null ? (
        <div className="text-center text-gray-400 text-sm py-12">กรุณาเลือกเดือนและกดค้นหา</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">
          ไม่พบรายการหัก ณ ที่จ่ายในเดือน{MONTH_NAMES[month - 1]} {year + 543}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
              <div className="text-xs text-indigo-600 mb-1">จำนวนรายการ</div>
              <div className="text-2xl font-bold text-indigo-700">{items.length}</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">จำนวนผู้ขาย</div>
              <div className="text-2xl font-bold text-blue-700">{Object.keys(byVendor).length}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <div className="text-xs text-red-600 mb-1">ภาษีหัก ณ ที่จ่ายรวม</div>
              <div className="text-lg font-bold text-red-700">฿{formatCurrency(totalWHT)}</div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <div className="text-xs text-green-600 mb-1">จำนวนเงินที่จ่ายรวม</div>
              <div className="text-lg font-bold text-green-700">฿{formatCurrency(totalAmount)}</div>
            </div>
          </div>

          {/* Main Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันที่จ่าย</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขที่ชำระ</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผู้ขาย</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขประจำตัวผู้เสียภาษี</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขใบแจ้งหนี้</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">จำนวนเงินที่จ่าย</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">อัตรา</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">ภาษีหัก ณ ที่จ่าย</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">สุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-4 whitespace-nowrap">{formatDate(i.prep.payment.paymentDate)}</td>
                    <td className="py-2.5 px-4">
                      <Link href={`/payments/${i.prep.payment.id}`} className="font-mono text-blue-700 hover:underline">
                        {i.prep.payment.paymentNumber}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-800">{i.ap.vendor.name}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{i.ap.vendor.taxId ?? "-"}</td>
                    <td className="py-2.5 px-4 text-gray-600">{i.ap.invoiceNumber}</td>
                    <td className="py-2.5 px-4 text-right text-gray-700">฿{formatCurrency(i.amount)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-600">{i.withholdingTaxRate}%</td>
                    <td className="py-2.5 px-4 text-right text-red-600">฿{formatCurrency(i.withholdingTaxAmount)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-gray-900">฿{formatCurrency(i.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                  <td colSpan={5} className="py-2.5 px-4 text-right text-gray-700">รวม</td>
                  <td className="py-2.5 px-4 text-right text-gray-800">฿{formatCurrency(totalAmount)}</td>
                  <td></td>
                  <td className="py-2.5 px-4 text-right text-red-700">฿{formatCurrency(totalWHT)}</td>
                  <td className="py-2.5 px-4 text-right text-green-700">฿{formatCurrency(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Vendor Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">สรุปตามผู้ขาย</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-600">ผู้ขาย</th>
                  <th className="text-left py-2 font-medium text-gray-600">เลขประจำตัวผู้เสียภาษี</th>
                  <th className="text-right py-2 font-medium text-gray-600">จำนวนรายการ</th>
                  <th className="text-right py-2 font-medium text-gray-600">จำนวนเงินที่จ่าย</th>
                  <th className="text-right py-2 font-medium text-gray-600">ภาษีหัก ณ ที่จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(byVendor)
                  .sort((a, b) => b.wht - a.wht)
                  .map((v) => (
                    <tr key={v.name} className="border-b border-gray-100">
                      <td className="py-2 text-gray-800">{v.name}</td>
                      <td className="py-2 font-mono text-xs text-gray-500">{v.taxId}</td>
                      <td className="py-2 text-right text-gray-600">{v.count}</td>
                      <td className="py-2 text-right text-gray-700">฿{formatCurrency(v.amount)}</td>
                      <td className="py-2 text-right font-medium text-red-700">฿{formatCurrency(v.wht)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
