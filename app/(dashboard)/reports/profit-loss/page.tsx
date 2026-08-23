"use client";

import { useState } from "react";
import { getProfitLossReport, ProfitLossReport } from "@/actions/reports";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function ProfitLossPage() {
  const now = new Date();
  const [periodType, setPeriodType] = useState<"month" | "year">("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const data = await getProfitLossReport(periodType === "month" ? { year, month } : { year });
    setReport(data);
    setLoading(false);
  }

  const periodLabel =
    periodType === "month" ? `${MONTH_NAMES[month - 1]} ${year + 543}` : `ปี ${year + 543}`;

  function handleDownloadCSV() {
    if (!report) return;
    const headers = ["หมวดบัญชี", "จำนวนเงิน"];
    const rows: (string | number)[][] = [
      ["รายได้รวม", report.revenue],
      ["ค่าใช้จ่ายรวม", report.expenses],
      ["กำไร(ขาดทุน)สุทธิ", report.net],
      [],
      ["รายละเอียดค่าใช้จ่ายตามหมวดบัญชี", ""],
      ...report.categoryBreakdown.map((c) => [c.accountName, c.amount]),
    ];
    downloadCSV(`งบกำไรขาดทุน_${periodType === "month" ? `${year}_${String(month).padStart(2, "0")}` : year}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">งบกำไรขาดทุน</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ช่วงเวลา</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button
              onClick={() => setPeriodType("month")}
              className={`px-3 py-2 ${periodType === "month" ? "bg-blue-700 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              รายเดือน
            </button>
            <button
              onClick={() => setPeriodType("year")}
              className={`px-3 py-2 border-l border-gray-300 ${periodType === "year" ? "bg-blue-700 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              รายปี
            </button>
          </div>
        </div>
        {periodType === "month" && (
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
        )}
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
        {report && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {report === null ? (
        <div className="text-center text-gray-400 text-sm py-12">กรุณาเลือกช่วงเวลาและกดค้นหา</div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">งบกำไรขาดทุนสำหรับ{periodLabel}</p>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">รายได้รวม</div>
              <div className="text-2xl font-bold text-blue-700">฿{formatCurrency(report.revenue)}</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">ค่าใช้จ่ายรวม</div>
              <div className="text-2xl font-bold text-orange-700">฿{formatCurrency(report.expenses)}</div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${report.net >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              <div className={`text-xs mb-1 ${report.net >= 0 ? "text-green-600" : "text-red-600"}`}>กำไร(ขาดทุน)สุทธิ</div>
              <div className={`text-2xl font-bold ${report.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                {report.net < 0 && "-"}฿{formatCurrency(Math.abs(report.net))}
              </div>
            </div>
          </div>

          {/* Monthly trend (year mode only) */}
          {report.monthly && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
              <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">แนวโน้มรายเดือน</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">เดือน</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">รายได้</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">ค่าใช้จ่าย</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">กำไร(ขาดทุน)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.monthly.map((m) => (
                    <tr key={m.month} className="border-b border-gray-100">
                      <td className="py-2 px-4 text-gray-800">{MONTH_NAMES[m.month - 1]}</td>
                      <td className="py-2 px-4 text-right text-gray-700">฿{formatCurrency(m.revenue)}</td>
                      <td className="py-2 px-4 text-right text-gray-700">฿{formatCurrency(m.expenses)}</td>
                      <td className={`py-2 px-4 text-right font-medium ${m.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {m.net < 0 && "-"}฿{formatCurrency(Math.abs(m.net))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                    <td className="py-2.5 px-4 text-gray-700">รวม</td>
                    <td className="py-2.5 px-4 text-right text-blue-700">฿{formatCurrency(report.revenue)}</td>
                    <td className="py-2.5 px-4 text-right text-orange-700">฿{formatCurrency(report.expenses)}</td>
                    <td className={`py-2.5 px-4 text-right ${report.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {report.net < 0 && "-"}฿{formatCurrency(Math.abs(report.net))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Expense category breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">ค่าใช้จ่ายแยกตามหมวดบัญชี</div>
            {report.categoryBreakdown.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">ไม่มีค่าใช้จ่ายในช่วงเวลานี้</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">หมวดบัญชี</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">จำนวนเงิน</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">% ของค่าใช้จ่าย</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categoryBreakdown.map((c) => (
                    <tr key={c.accountId ?? c.accountName} className="border-b border-gray-100">
                      <td className="py-2 px-4 text-gray-800">{c.accountName}</td>
                      <td className="py-2 px-4 text-right text-gray-700">฿{formatCurrency(c.amount)}</td>
                      <td className="py-2 px-4 text-right text-gray-500">
                        {report.expenses > 0 ? `${((c.amount / report.expenses) * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                    <td className="py-2.5 px-4 text-gray-700">รวม</td>
                    <td className="py-2.5 px-4 text-right text-orange-700">฿{formatCurrency(report.expenses)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-500">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
