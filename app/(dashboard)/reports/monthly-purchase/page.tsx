"use client";

import { useState } from "react";
import { getMonthlyPurchaseReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type AP = Awaited<ReturnType<typeof getMonthlyPurchaseReport>>[number];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอดำเนินการ", color: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-blue-100 text-blue-700" },
  PAYMENT_PREP: { label: "เตรียมจ่าย", color: "bg-purple-100 text-purple-700" },
  PAID: { label: "ชำระแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-gray-100 text-gray-500" },
};

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function MonthlyPurchasePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [aps, setAPs] = useState<AP[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const data = await getMonthlyPurchaseReport(year, month);
    setAPs(data);
    setLoading(false);
  }

  const totalAmount = aps?.reduce((s, ap) => s + ap.amount, 0) ?? 0;
  const totalVAT = aps?.reduce((s, ap) => s + ap.vatAmount, 0) ?? 0;
  const totalAll = aps?.reduce((s, ap) => s + ap.totalAmount, 0) ?? 0;

  // Group by vendor
  const byVendor = (aps ?? []).reduce<Record<string, { name: string; count: number; amount: number; total: number }>>((acc, ap) => {
    const key = ap.vendorId;
    if (!acc[key]) acc[key] = { name: ap.vendor.name, count: 0, amount: 0, total: 0 };
    acc[key].count++;
    acc[key].amount += ap.amount;
    acc[key].total += ap.totalAmount;
    return acc;
  }, {});

  function handleDownloadCSV() {
    if (!aps || aps.length === 0) return;
    const headers = ["เลข AP", "เลขใบแจ้งหนี้", "ผู้ขาย", "เลข PO", "วันที่ออกบิล", "ครบกำหนด", "สถานะ", "จำนวนเงิน", "VAT", "ยอดรวม"];
    const rows = aps.map((ap) => [
      ap.apNumber,
      ap.invoiceNumber,
      ap.vendor.name,
      ap.po?.poNumber ?? "",
      formatDate(ap.invoiceDate),
      formatDate(ap.dueDate),
      STATUS_LABELS[ap.status]?.label ?? ap.status,
      ap.amount,
      ap.vatAmount,
      ap.totalAmount,
    ]);
    downloadCSV(`รายงานการซื้อ_${year}_${String(month).padStart(2, "0")}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายงานการซื้อประจำเดือน</h1>
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
        {aps && aps.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {aps === null ? (
        <div className="text-center text-gray-400 text-sm py-12">กรุณาเลือกเดือนและกดค้นหา</div>
      ) : aps.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">
          ไม่พบรายการตั้งหนี้ในเดือน{MONTH_NAMES[month - 1]} {year + 543}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
              <div className="text-xs text-indigo-600 mb-1">จำนวนรายการ</div>
              <div className="text-2xl font-bold text-indigo-700">{aps.length}</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">จำนวนผู้ขาย</div>
              <div className="text-2xl font-bold text-blue-700">{Object.keys(byVendor).length}</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">VAT รวม</div>
              <div className="text-lg font-bold text-orange-700">฿{formatCurrency(totalVAT)}</div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <div className="text-xs text-green-600 mb-1">ยอดซื้อรวม (รวม VAT)</div>
              <div className="text-lg font-bold text-green-700">฿{formatCurrency(totalAll)}</div>
            </div>
          </div>

          {/* Main Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลข AP</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขใบแจ้งหนี้</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผู้ขาย</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลข PO</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันที่ออกบิล</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">ครบกำหนด</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">สถานะ</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">จำนวนเงิน</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">VAT</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {aps.map((ap) => {
                  const s = STATUS_LABELS[ap.status] ?? { label: ap.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={ap.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-4">
                        <Link href={`/accounts-payable/${ap.id}`} className="font-mono text-blue-700 hover:underline">
                          {ap.apNumber}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-gray-600">{ap.invoiceNumber}</td>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{ap.vendor.name}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{ap.po?.poNumber ?? "-"}</td>
                      <td className="py-2.5 px-4 text-gray-600">{formatDate(ap.invoiceDate)}</td>
                      <td className="py-2.5 px-4 text-gray-600">{formatDate(ap.dueDate)}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700">฿{formatCurrency(ap.amount)}</td>
                      <td className="py-2.5 px-4 text-right text-orange-600">
                        {ap.vatAmount > 0 ? `฿${formatCurrency(ap.vatAmount)}` : "-"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-900">฿{formatCurrency(ap.totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                  <td colSpan={7} className="py-2.5 px-4 text-right text-gray-700">รวม</td>
                  <td className="py-2.5 px-4 text-right text-gray-800">฿{formatCurrency(totalAmount)}</td>
                  <td className="py-2.5 px-4 text-right text-orange-700">฿{formatCurrency(totalVAT)}</td>
                  <td className="py-2.5 px-4 text-right text-green-700">฿{formatCurrency(totalAll)}</td>
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
                  <th className="text-right py-2 font-medium text-gray-600">จำนวนรายการ</th>
                  <th className="text-right py-2 font-medium text-gray-600">จำนวนเงิน</th>
                  <th className="text-right py-2 font-medium text-gray-600">ยอดรวม (รวม VAT)</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(byVendor)
                  .sort((a, b) => b.total - a.total)
                  .map((v) => (
                    <tr key={v.name} className="border-b border-gray-100">
                      <td className="py-2 text-gray-800">{v.name}</td>
                      <td className="py-2 text-right text-gray-600">{v.count}</td>
                      <td className="py-2 text-right text-gray-700">฿{formatCurrency(v.amount)}</td>
                      <td className="py-2 text-right font-medium text-gray-900">฿{formatCurrency(v.total)}</td>
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
