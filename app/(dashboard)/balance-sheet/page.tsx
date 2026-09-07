"use client";

import { useState } from "react";
import Link from "next/link";
import { getBalanceSheet, BalanceSheetResult, BalanceSheetRow } from "@/actions/ledger";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

const money = (n: number) => `${n < 0 ? "-" : ""}฿${formatCurrency(Math.abs(n))}`;

function Section({ title, rows, total, totalLabel }: { title: string; rows: BalanceSheetRow[]; total: number; totalLabel?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800 text-sm">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-2 text-gray-400" colSpan={2}>ไม่มียอด</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.accountId} className="border-b border-gray-100">
                <td className="px-4 py-2 text-gray-800">
                  <span className="font-mono text-gray-400 text-xs mr-2">{r.code}</span>
                  {r.name}
                </td>
                <td className="px-4 py-2 text-right text-gray-700 w-40">{money(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
            <td className="px-4 py-2.5">{totalLabel ?? `รวม${title}`}</td>
            <td className="px-4 py-2.5 text-right">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<BalanceSheetResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    setResult(await getBalanceSheet({ asOf }));
    setLoading(false);
  }

  function handleDownloadCSV() {
    if (!result) return;
    const headers = ["หมวด", "รหัสบัญชี", "ชื่อบัญชี", "จำนวนเงิน"];
    const rows: (string | number)[][] = [];
    for (const r of result.assets) rows.push(["สินทรัพย์", r.code, r.name, r.amount]);
    rows.push(["", "", "รวมสินทรัพย์", result.totalAssets]);
    for (const r of result.liabilities) rows.push(["หนี้สิน", r.code, r.name, r.amount]);
    rows.push(["", "", "รวมหนี้สิน", result.totalLiabilities]);
    for (const r of result.equity) rows.push(["ส่วนของผู้ถือหุ้น", r.code, r.name, r.amount]);
    rows.push(["ส่วนของผู้ถือหุ้น", "", "กำไร(ขาดทุน)สะสม", result.retainedEarnings]);
    rows.push(["", "", "รวมส่วนของผู้ถือหุ้น", result.totalEquity]);
    rows.push(["", "", "รวมหนี้สินและส่วนของผู้ถือหุ้น", result.totalLiabilities + result.totalEquity]);
    for (const r of result.unclassified) rows.push(["ยังไม่จัดหมวด", r.code, r.name, r.amount]);
    downloadCSV(`balance_sheet_${result.asOf}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบแสดงฐานะทางการเงิน</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            ยอดคงเหลือ ณ วันที่ ของสินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น จากบัญชีแยกประเภทชุดเดียวกับ
            <Link href="/trial-balance" className="text-blue-700 hover:underline">งบทดลอง</Link>
          </p>
        </div>
        {result && (
          <a href={`/api/export/balance-sheet?asOf=${result.asOf}`} className="text-sm text-green-700 hover:underline font-medium">
            ⬇ .xlsx
          </a>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ณ วันที่</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
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
        {result && (
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
        <div className="text-center text-gray-400 text-sm py-12">เลือกวันที่ แล้วกดค้นหา</div>
      ) : (
        <>
          {result.unsetKeys.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              มีบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า — ยอดบางส่วนจะแสดงในกลุ่ม &quot;ยังไม่จัดหมวด&quot;{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link>
            </div>
          )}
          {!result.balanced && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              ⚠ สินทรัพย์ ({money(result.totalAssets)}) ≠ หนี้สิน + ส่วนของผู้ถือหุ้น ({money(result.totalLiabilities + result.totalEquity)}) — ผลต่าง {money(result.diff)}
              {Math.abs(result.diff + result.unclassifiedNet) < 0.01 && result.unclassifiedNet !== 0 && (
                <> (เท่ากับยอดในบัญชีที่ยังไม่จัดหมวด {money(result.unclassifiedNet)})</>
              )}
            </div>
          )}

          <p className="text-sm text-gray-500 mb-3">งบแสดงฐานะทางการเงิน ณ วันที่ {new Date(result.asOf).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-5">
              <Section title="สินทรัพย์" rows={result.assets} total={result.totalAssets} />
            </div>
            <div className="space-y-5">
              <Section title="หนี้สิน" rows={result.liabilities} total={result.totalLiabilities} />
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800 text-sm">ส่วนของผู้ถือหุ้น</div>
                <table className="w-full text-sm">
                  <tbody>
                    {result.equity.map((r) => (
                      <tr key={r.accountId} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-800">
                          <span className="font-mono text-gray-400 text-xs mr-2">{r.code}</span>
                          {r.name}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 w-40">{money(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2 text-gray-800">กำไร(ขาดทุน)สะสม</td>
                      <td className={`px-4 py-2 text-right w-40 ${result.retainedEarnings >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {money(result.retainedEarnings)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
                      <td className="px-4 py-2.5">รวมส่วนของผู้ถือหุ้น</td>
                      <td className="px-4 py-2.5 text-right">{money(result.totalEquity)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex justify-between font-semibold text-blue-800">
                <span>รวมหนี้สินและส่วนของผู้ถือหุ้น</span>
                <span>{money(result.totalLiabilities + result.totalEquity)}</span>
              </div>
            </div>
          </div>

          {result.unclassified.length > 0 && (
            <div className="mt-5">
              <Section title="ยังไม่จัดหมวด (บัญชีคุมยอดที่ยังไม่ได้ตั้งค่า)" rows={result.unclassified} total={result.unclassifiedNet} totalLabel="รวมยังไม่จัดหมวด (เดบิต − เครดิต)" />
            </div>
          )}

          <div className={`mt-5 rounded-xl border px-4 py-3 flex justify-between font-bold text-sm ${result.balanced ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
            <span>{result.balanced ? "✓ งบดุล — สินทรัพย์ = หนี้สิน + ส่วนของผู้ถือหุ้น" : "งบไม่ดุล"}</span>
            <span>{money(result.totalAssets)} {result.balanced ? "=" : "≠"} {money(result.totalLiabilities + result.totalEquity)}</span>
          </div>
        </>
      )}
    </div>
  );
}
