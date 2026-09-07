"use client";

import { useState } from "react";
import Link from "next/link";
import { getCashFlow, CashFlowResult, CashFlowLine } from "@/actions/ledger";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

const money = (n: number) => `${n < 0 ? "-" : ""}฿${formatCurrency(Math.abs(n))}`;

function Group({ title, lines, net }: { title: string; lines: CashFlowLine[]; net: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800 text-sm">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="px-4 py-2 text-gray-400" colSpan={2}>ไม่มีรายการ</td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.label} className="border-b border-gray-100">
                <td className="px-4 py-2 text-gray-800">{l.label}</td>
                <td className={`px-4 py-2 text-right w-44 ${l.amount >= 0 ? "text-green-700" : "text-red-600"}`}>{money(l.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
            <td className="px-4 py-2.5">เงินสดสุทธิจาก{title}</td>
            <td className={`px-4 py-2.5 text-right ${net >= 0 ? "text-green-700" : "text-red-600"}`}>{money(net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function CashFlowPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<CashFlowResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    setResult(await getCashFlow({ from, to }));
    setLoading(false);
  }

  function handleDownloadCSV() {
    if (!result) return;
    const headers = ["กิจกรรม", "รายการ", "จำนวนเงิน"];
    const rows: (string | number)[][] = [];
    const push = (act: string, lines: CashFlowLine[], net: number, netLabel: string) => {
      for (const l of lines) rows.push([act, l.label, l.amount]);
      rows.push(["", netLabel, net]);
    };
    push("ดำเนินงาน", result.operating, result.netOperating, "เงินสดสุทธิจากกิจกรรมดำเนินงาน");
    push("ลงทุน", result.investing, result.netInvesting, "เงินสดสุทธิจากกิจกรรมลงทุน");
    push("จัดหาเงิน", result.financing, result.netFinancing, "เงินสดสุทธิจากกิจกรรมจัดหาเงิน");
    rows.push(["", "เงินสดเพิ่มขึ้น(ลดลง)สุทธิ", result.netChange]);
    rows.push(["", "เงินสดต้นงวด", result.openingCash]);
    rows.push(["", "เงินสดปลายงวด", result.closingCash]);
    downloadCSV(`cash_flow_${result.from}_${result.to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบกระแสเงินสด</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            วิธีตรง — เงินสดรับ/จ่ายผ่านบัญชีธนาคารบริษัท แยกตามกิจกรรมดำเนินงาน/ลงทุน/จัดหาเงิน
          </p>
        </div>
        {result && (
          <a href={`/api/export/cash-flow?from=${result.from}&to=${result.to}`} className="text-sm text-green-700 hover:underline font-medium">
            ⬇ .xlsx
          </a>
        )}
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
        <div className="text-center text-gray-400 text-sm py-12">เลือกช่วงเวลา แล้วกดค้นหา</div>
      ) : (
        <>
          {result.cashAccounts.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              ยังไม่ได้ผูกบัญชีธนาคารบริษัทเข้ากับผังบัญชี — งบนี้จะว่างจนกว่าจะตั้งค่า{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link>
            </div>
          )}
          {result.unmappedBanks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              บัญชีธนาคารที่มีเงินเคลื่อนไหวแต่ยังไม่ผูกผังบัญชี (ไม่รวมในงบนี้): {result.unmappedBanks.join(", ")}{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link>
            </div>
          )}
          {!result.reconciled && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              ⚠ เงินสดต้นงวด + กระแสเงินสดสุทธิ ≠ เงินสดปลายงวด
            </div>
          )}

          <p className="text-sm text-gray-500 mb-3">งบกระแสเงินสดสำหรับงวด {result.from} ถึง {result.to}</p>
          <p className="text-xs text-gray-400 mb-3">
            คิดจากการเคลื่อนไหวที่บันทึกในระบบเท่านั้น — ยอดเงินสดยกมาก่อนเริ่มใช้ระบบ (openingBalance ของบัญชีธนาคาร) ไม่รวมในงบนี้ เช่นเดียวกับงบทดลอง
          </p>

          <div className="space-y-5">
            <Group title="กิจกรรมดำเนินงาน" lines={result.operating} net={result.netOperating} />
            <Group title="กิจกรรมลงทุน" lines={result.investing} net={result.netInvesting} />
            <Group title="กิจกรรมจัดหาเงิน" lines={result.financing} net={result.netFinancing} />

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100 font-semibold text-gray-900">
                    <td className="px-4 py-2.5">เงินสดเพิ่มขึ้น(ลดลง)สุทธิ</td>
                    <td className={`px-4 py-2.5 text-right w-44 ${result.netChange >= 0 ? "text-green-700" : "text-red-600"}`}>{money(result.netChange)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 text-gray-600">
                    <td className="px-4 py-2">เงินสดและรายการเทียบเท่าเงินสด ต้นงวด</td>
                    <td className="px-4 py-2 text-right">{money(result.openingCash)}</td>
                  </tr>
                  <tr className="bg-gray-50 font-bold text-gray-900 border-t-2 border-gray-300">
                    <td className="px-4 py-2.5">เงินสดและรายการเทียบเท่าเงินสด ปลายงวด</td>
                    <td className="px-4 py-2.5 text-right">{money(result.closingCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {result.cashAccounts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800 text-sm">เงินสดปลายงวด แยกตามบัญชี</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600 border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-medium">บัญชี</th>
                      <th className="text-right px-4 py-2 font-medium">ต้นงวด</th>
                      <th className="text-right px-4 py-2 font-medium">ปลายงวด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cashAccounts.map((a) => (
                      <tr key={a.code} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-800">
                          <span className="font-mono text-gray-400 text-xs mr-2">{a.code}</span>
                          {a.name}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">{money(a.opening)}</td>
                        <td className="px-4 py-2 text-right text-gray-800">{money(a.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
