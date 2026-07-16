"use client";

import { useState, useEffect } from "react";
import { getOverdueAPReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type AP = Awaited<ReturnType<typeof getOverdueAPReport>>[number];

function daysOverdue(date: Date) {
  return Math.floor((new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function overdueColor(days: number) {
  if (days >= 90) return "text-red-700 font-bold";
  if (days >= 30) return "text-orange-600 font-semibold";
  return "text-yellow-600";
}

function agingBucket(days: number) {
  if (days < 30) return "1-30 วัน";
  if (days < 60) return "31-60 วัน";
  if (days < 90) return "61-90 วัน";
  return "มากกว่า 90 วัน";
}

export default function OverdueAPPage() {
  const [aps, setAPs] = useState<AP[] | null>(null);

  useEffect(() => {
    getOverdueAPReport().then(setAPs);
  }, []);

  if (aps === null) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const totalAmount = aps.reduce((s, ap) => s + ap.totalAmount, 0);

  // Aging analysis
  const aging: Record<string, { count: number; total: number }> = {};
  aps.forEach((ap) => {
    const bucket = agingBucket(daysOverdue(ap.dueDate));
    if (!aging[bucket]) aging[bucket] = { count: 0, total: 0 };
    aging[bucket].count++;
    aging[bucket].total += ap.totalAmount;
  });

  const agingOrder = ["1-30 วัน", "31-60 วัน", "61-90 วัน", "มากกว่า 90 วัน"];

  function handleDownloadCSV() {
    if (!aps || aps.length === 0) return;
    const headers = ["เลข AP", "ผู้ขาย", "เลขใบแจ้งหนี้", "วันครบกำหนด", "เกินกำหนด (วัน)", "บัญชีธนาคาร", "ยอดรวม"];
    const rows = aps.map((ap) => {
      const days = daysOverdue(ap.dueDate);
      const bank = ap.vendor.bankAccountNo
        ? `${ap.vendor.bankAccountNo} ${ap.vendor.bankAccountName ?? ""}`.trim()
        : "";
      return [
        ap.apNumber,
        ap.vendor.name,
        ap.invoiceNumber,
        formatDate(ap.dueDate),
        days,
        bank,
        ap.totalAmount,
      ];
    });
    downloadCSV("รายงานเจ้าหนี้เกินกำหนดชำระ.csv", headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายงานเจ้าหนี้เกินกำหนดชำระ</h1>
        {aps.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="ml-auto bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {aps.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-semibold text-green-800">ไม่มีรายการที่เกินกำหนดชำระ</div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center col-span-2 sm:col-span-1">
              <div className="text-xs text-red-600 mb-1">ยอดเกินกำหนดรวม</div>
              <div className="text-xl font-bold text-red-700">฿{formatCurrency(totalAmount)}</div>
              <div className="text-xs text-red-500 mt-0.5">{aps.length} รายการ</div>
            </div>
            {agingOrder.map((bucket) => {
              const d = aging[bucket] ?? { count: 0, total: 0 };
              return (
                <div key={bucket} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{bucket}</div>
                  <div className="font-bold text-gray-800">฿{formatCurrency(d.total)}</div>
                  <div className="text-xs text-gray-400">{d.count} รายการ</div>
                </div>
              );
            })}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลข AP</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผู้ขาย</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขใบแจ้งหนี้</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันครบกำหนด</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">เกินกำหนด (วัน)</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">บัญชีธนาคาร</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-600">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {aps.map((ap) => {
                  const days = daysOverdue(ap.dueDate);
                  return (
                    <tr key={ap.id} className="border-b border-gray-100 hover:bg-red-50/30">
                      <td className="py-2.5 px-4">
                        <Link href={`/accounts-payable/${ap.id}`} className="font-mono text-blue-700 hover:underline">
                          {ap.apNumber}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{ap.vendor.name}</td>
                      <td className="py-2.5 px-4 text-gray-600">{ap.invoiceNumber}</td>
                      <td className="py-2.5 px-4 text-red-600">{formatDate(ap.dueDate)}</td>
                      <td className={`py-2.5 px-4 text-right ${overdueColor(days)}`}>{days} วัน</td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">
                        {ap.vendor.bankAccountNo
                          ? `${ap.vendor.bankAccountNo} ${ap.vendor.bankAccountName ?? ""}`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-red-700">
                        ฿{formatCurrency(ap.totalAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 font-bold border-t border-red-200">
                  <td colSpan={6} className="py-2.5 px-4 text-right text-red-700">ยอดรวมเกินกำหนด</td>
                  <td className="py-2.5 px-4 text-right text-red-700">฿{formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
