"use client";

import { useState } from "react";
import Link from "next/link";
import { getTrialBalance, TrialBalanceResult } from "@/actions/ledger";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

const cell = (n: number) => (n === 0 ? "" : `฿${formatCurrency(n)}`);

export default function TrialBalancePage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<TrialBalanceResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    setResult(await getTrialBalance({ from, to }));
    setLoading(false);
  }

  function handleDownloadCSV() {
    if (!result) return;
    const headers = [
      "รหัสบัญชี", "ชื่อบัญชี",
      "ยกมา-เดบิต", "ยกมา-เครดิต",
      "เดบิต", "เครดิต",
      "ยกไป-เดบิต", "ยกไป-เครดิต",
    ];
    const rows: (string | number)[][] = result.rows.map((r) => [
      r.code, r.name,
      r.openingDebit || "", r.openingCredit || "",
      r.periodDebit || "", r.periodCredit || "",
      r.closingDebit || "", r.closingCredit || "",
    ]);
    const t = result.totals;
    rows.push([
      "", "รวม",
      t.openingDebit, t.openingCredit,
      t.periodDebit, t.periodCredit,
      t.closingDebit, t.closingCredit,
    ]);
    downloadCSV(`trial_balance_${from}_${to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบทดลอง</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            ยอดยกมา เคลื่อนไหว และยอดยกไปของทุกบัญชี — ยอดยกมาคำนวณจากรายการก่อนวันต้นงวดอัตโนมัติ
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/export/trial-balance" className="text-sm text-green-700 hover:underline font-medium">
            ⬇ .xlsx
          </a>
          <Link href="/accounting-config" className="text-sm text-blue-700 hover:underline font-medium">
            ⚙ ตั้งค่าผังบัญชีคุมยอด
          </Link>
        </div>
      </div>

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
        {result && result.rows.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {loading ? (
        <PageLoading />
      ) : result === null ? (
        <div className="text-center text-gray-400 text-sm py-12">เลือกช่วงเวลา แล้วกดค้นหา</div>
      ) : (
        <>
          {result.unsetKeys.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              มีบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า — ยอดจะแสดงในแถว &quot;(ยังไม่ได้ตั้งค่า)&quot;{" "}
              <Link href="/accounting-config" className="underline font-medium">
                ไปตั้งค่า
              </Link>
            </div>
          )}
          {!result.balanced && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              ⚠ งบทดลองไม่ดุล — เดบิตรวมไม่เท่ากับเครดิตรวม ตรวจสอบความครบถ้วนของข้อมูลเอกสารและการตั้งค่าผังบัญชีคุมยอด
            </div>
          )}

          {result.rows.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12 bg-white rounded-xl border border-gray-200">
              ไม่มีความเคลื่อนไหวในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium" rowSpan={2}>รหัส</th>
                    <th className="text-left px-3 py-2 font-medium" rowSpan={2}>ชื่อบัญชี</th>
                    <th className="text-center px-3 py-2 font-medium border-l border-gray-200" colSpan={2}>ยอดยกมา</th>
                    <th className="text-center px-3 py-2 font-medium border-l border-gray-200" colSpan={2}>เคลื่อนไหว</th>
                    <th className="text-center px-3 py-2 font-medium border-l border-gray-200" colSpan={2}>ยอดยกไป</th>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs">
                    <th className="text-right px-3 py-1.5 font-medium border-l border-gray-200">เดบิต</th>
                    <th className="text-right px-3 py-1.5 font-medium">เครดิต</th>
                    <th className="text-right px-3 py-1.5 font-medium border-l border-gray-200">เดบิต</th>
                    <th className="text-right px-3 py-1.5 font-medium">เครดิต</th>
                    <th className="text-right px-3 py-1.5 font-medium border-l border-gray-200">เดบิต</th>
                    <th className="text-right px-3 py-1.5 font-medium">เครดิต</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-500">{r.code}</td>
                      <td className="px-3 py-2 text-gray-800">{r.name}</td>
                      <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-100">{cell(r.openingDebit)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{cell(r.openingCredit)}</td>
                      <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-100">{cell(r.periodDebit)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{cell(r.periodCredit)}</td>
                      <td className="px-3 py-2 text-right text-gray-800 border-l border-gray-100">{cell(r.closingDebit)}</td>
                      <td className="px-3 py-2 text-right text-gray-800">{cell(r.closingCredit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
                    <td className="px-3 py-2.5" colSpan={2}>รวม</td>
                    <td className="px-3 py-2.5 text-right border-l border-gray-200">฿{formatCurrency(result.totals.openingDebit)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(result.totals.openingCredit)}</td>
                    <td className="px-3 py-2.5 text-right border-l border-gray-200">฿{formatCurrency(result.totals.periodDebit)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(result.totals.periodCredit)}</td>
                    <td className="px-3 py-2.5 text-right border-l border-gray-200">฿{formatCurrency(result.totals.closingDebit)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(result.totals.closingCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
