"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getLedgerAccounts,
  getGeneralLedger,
  GeneralLedgerResult,
} from "@/actions/ledger";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

type Account = Awaited<ReturnType<typeof getLedgerAccounts>>[number];

const amt = (n: number) => (n === 0 ? "-" : `฿${formatCurrency(n)}`);

export default function GeneralLedgerPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("ALL");
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<GeneralLedgerResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLedgerAccounts().then(setAccounts);
  }, []);

  async function handleSearch() {
    setLoading(true);
    setResult(await getGeneralLedger({ accountId, from, to }));
    setLoading(false);
  }

  function handleDownloadCSV() {
    if (!result) return;
    const headers = ["รหัสบัญชี", "ชื่อบัญชี", "วันที่", "ประเภทเอกสาร", "เลขที่", "รายละเอียด", "เดบิต", "เครดิต", "คงเหลือ"];
    const rows: (string | number)[][] = [];
    for (const b of result.blocks) {
      rows.push([b.code, b.name, "", "", "", "ยอดยกมา", "", "", b.opening]);
      for (const e of b.entries) {
        rows.push([b.code, b.name, formatDate(e.date), e.sourceTypeLabel, e.sourceNumber, e.description, e.debit || "", e.credit || "", e.balance]);
      }
      rows.push([b.code, b.name, "", "", "", "รวม/ยกไป", b.totalDebit, b.totalCredit, b.closing]);
    }
    downloadCSV(`general_ledger_${from}_${to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">บัญชีแยกประเภท</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            รายการเดบิต-เครดิตรายบัญชี สังเคราะห์จากสมุดรายวันทั่วไป + เอกสารขาย/ซื้อ/รับ/จ่าย
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/export/general-ledger" className="text-sm text-green-700 hover:underline font-medium">
            ⬇ .xlsx (ทั้งหมด)
          </a>
          <Link href="/accounting-config" className="text-sm text-blue-700 hover:underline font-medium">
            ⚙ ตั้งค่าผังบัญชีคุมยอด
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-56">
          <label className="block text-xs font-medium text-gray-600 mb-1">บัญชี</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">ทุกบัญชี</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
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
        {result && result.blocks.length > 0 && (
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
        <div className="text-center text-gray-400 text-sm py-12">เลือกบัญชีและช่วงเวลา แล้วกดค้นหา</div>
      ) : (
        <>
          {result.unsetKeys.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              มีบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า — บางรายการจะตกในบัญชี &quot;(ยังไม่ได้ตั้งค่า)&quot;{" "}
              <Link href="/accounting-config" className="underline font-medium">
                ไปตั้งค่า
              </Link>
            </div>
          )}
          {result.blocks.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12 bg-white rounded-xl border border-gray-200">
              ไม่มีรายการในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="space-y-5">
              {result.blocks.map((b) => (
                <div key={b.accountId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div className="font-semibold text-gray-800 text-sm">
                      <span className="font-mono text-gray-500 mr-2">{b.code}</span>
                      {b.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      ยอดยกไป <span className="font-semibold text-gray-800">฿{formatCurrency(b.closing)}</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white border-b border-gray-200 text-gray-600">
                          <th className="text-left px-4 py-2 font-medium whitespace-nowrap">วันที่</th>
                          <th className="text-left px-4 py-2 font-medium">เอกสาร</th>
                          <th className="text-left px-4 py-2 font-medium">รายละเอียด</th>
                          <th className="text-right px-4 py-2 font-medium">เดบิต</th>
                          <th className="text-right px-4 py-2 font-medium">เครดิต</th>
                          <th className="text-right px-4 py-2 font-medium">คงเหลือ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100 text-gray-500">
                          <td className="px-4 py-2" colSpan={3}>
                            ยอดยกมา
                          </td>
                          <td></td>
                          <td></td>
                          <td className="px-4 py-2 text-right">฿{formatCurrency(b.opening)}</td>
                        </tr>
                        {b.entries.map((e, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDate(e.date)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <Link href={e.href} className="text-blue-700 hover:underline font-mono text-xs">
                                {e.sourceNumber}
                              </Link>
                              <span className="text-gray-400 text-xs ml-1">{e.sourceTypeLabel}</span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">{e.description}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{amt(e.debit)}</td>
                            <td className="px-4 py-2 text-right text-gray-800">{amt(e.credit)}</td>
                            <td className="px-4 py-2 text-right text-gray-600">฿{formatCurrency(e.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                          <td className="px-4 py-2 text-gray-700" colSpan={3}>
                            รวมเคลื่อนไหว / ยอดยกไป
                          </td>
                          <td className="px-4 py-2 text-right text-gray-800">฿{formatCurrency(b.totalDebit)}</td>
                          <td className="px-4 py-2 text-right text-gray-800">฿{formatCurrency(b.totalCredit)}</td>
                          <td className="px-4 py-2 text-right text-gray-900">฿{formatCurrency(b.closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
