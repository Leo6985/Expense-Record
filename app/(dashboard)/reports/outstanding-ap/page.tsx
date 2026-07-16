"use client";

import { useState, useEffect } from "react";
import { getOutstandingAPReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type AP = Awaited<ReturnType<typeof getOutstandingAPReport>>[number];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอดำเนินการ", color: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-blue-100 text-blue-700" },
  PAYMENT_PREP: { label: "เตรียมจ่าย", color: "bg-purple-100 text-purple-700" },
};

function daysDiff(date: Date) {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function OutstandingAPPage() {
  const [aps, setAPs] = useState<AP[] | null>(null);
  const [vendorFilter, setVendorFilter] = useState("");

  useEffect(() => {
    getOutstandingAPReport().then(setAPs);
  }, []);

  if (aps === null) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const filtered = vendorFilter
    ? aps.filter((ap) => ap.vendor.name.toLowerCase().includes(vendorFilter.toLowerCase()))
    : aps;

  const totalAmount = filtered.reduce((s, ap) => s + ap.totalAmount, 0);

  // Group by vendor for summary
  const byVendor = filtered.reduce<Record<string, { name: string; count: number; total: number }>>((acc, ap) => {
    const key = ap.vendorId;
    if (!acc[key]) acc[key] = { name: ap.vendor.name, count: 0, total: 0 };
    acc[key].count++;
    acc[key].total += ap.totalAmount;
    return acc;
  }, {});

  function handleDownloadCSV() {
    if (!filtered || filtered.length === 0) return;
    const headers = ["เลข AP", "ผู้ขาย", "เลขใบแจ้งหนี้", "วันที่ออกบิล", "ครบกำหนด", "สถานะ", "อายุหนี้ (วัน)", "ยอดรวม"];
    const rows = filtered.map((ap) => {
      const isOverdue = new Date(ap.dueDate) < new Date();
      const age = daysDiff(ap.invoiceDate);
      const s = STATUS_LABELS[ap.status]?.label ?? ap.status;
      return [
        ap.apNumber,
        ap.vendor.name,
        ap.invoiceNumber,
        formatDate(ap.invoiceDate),
        formatDate(ap.dueDate) + (isOverdue ? ` (เกิน ${daysDiff(ap.dueDate)} วัน)` : ""),
        s,
        age,
        ap.totalAmount,
      ];
    });
    downloadCSV("รายงานเจ้าหนี้ค้างชำระ.csv", headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายงานเจ้าหนี้ค้างชำระ</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <div className="text-xs text-amber-600 mb-1">จำนวนรายการ</div>
          <div className="text-2xl font-bold text-amber-700">{filtered.length}</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <div className="text-xs text-blue-600 mb-1">จำนวนเจ้าหนี้</div>
          <div className="text-2xl font-bold text-blue-700">{Object.keys(byVendor).length}</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <div className="text-xs text-red-600 mb-1">ยอดค้างชำระรวม</div>
          <div className="text-xl font-bold text-red-700">฿{formatCurrency(totalAmount)}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-center gap-3">
        <span className="text-sm text-gray-500 whitespace-nowrap">กรองตามผู้ขาย:</span>
        <input
          type="text"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          placeholder="พิมพ์ชื่อผู้ขาย..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {vendorFilter && (
          <button onClick={() => setVendorFilter("")} className="text-gray-400 hover:text-gray-600 text-sm">ล้าง</button>
        )}
        {filtered.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors whitespace-nowrap"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">ไม่พบรายการค้างชำระ</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลข AP</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขใบแจ้งหนี้</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันที่ออกบิล</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ครบกำหนด</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">สถานะ</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-600">อายุหนี้ (วัน)</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-600">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ap) => {
                const isOverdue = new Date(ap.dueDate) < new Date();
                const age = daysDiff(ap.invoiceDate);
                const s = STATUS_LABELS[ap.status] ?? { label: ap.status, color: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={ap.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isOverdue ? "bg-red-50/40" : ""}`}>
                    <td className="py-2.5 px-4">
                      <Link href={`/accounts-payable/${ap.id}`} className="font-mono text-blue-700 hover:underline">
                        {ap.apNumber}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-800">{ap.vendor.name}</td>
                    <td className="py-2.5 px-4 text-gray-600">{ap.invoiceNumber}</td>
                    <td className="py-2.5 px-4 text-gray-600">{formatDate(ap.invoiceDate)}</td>
                    <td className={`py-2.5 px-4 ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                      {formatDate(ap.dueDate)}
                      {isOverdue && <span className="ml-1 text-xs">(เกิน {daysDiff(ap.dueDate)} วัน)</span>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-600">{age}</td>
                    <td className="py-2.5 px-4 text-right font-medium">฿{formatCurrency(ap.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                <td colSpan={7} className="py-2.5 px-4 text-right text-gray-700">ยอดรวมทั้งหมด</td>
                <td className="py-2.5 px-4 text-right text-red-700">฿{formatCurrency(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Vendor summary */}
      {filtered.length > 0 && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">สรุปตามผู้ขาย</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-600">ผู้ขาย</th>
                <th className="text-right py-2 font-medium text-gray-600">จำนวนรายการ</th>
                <th className="text-right py-2 font-medium text-gray-600">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(byVendor)
                .sort((a, b) => b.total - a.total)
                .map((v) => (
                  <tr key={v.name} className="border-b border-gray-100">
                    <td className="py-2 text-gray-800">{v.name}</td>
                    <td className="py-2 text-right text-gray-600">{v.count}</td>
                    <td className="py-2 text-right font-medium">฿{formatCurrency(v.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
