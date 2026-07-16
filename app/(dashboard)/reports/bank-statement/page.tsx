"use client";

import { useState, useEffect } from "react";
import { getCompanyBankAccounts, getBankStatementReport } from "@/actions/reports";
import { formatDate, formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import Link from "next/link";

type Account = Awaited<ReturnType<typeof getCompanyBankAccounts>>[number];
type StatementResult = Awaited<ReturnType<typeof getBankStatementReport>>;
type Payment = StatementResult["payments"][number];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: "โอนเงิน",
  CHECK: "เช็ค",
  CASH: "เงินสด",
};

export default function BankStatementPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [result, setResult] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCompanyBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setSelectedAccountId(list[0].id);
    });
  }, []);

  async function handleSearch() {
    if (!selectedAccountId) return;
    setLoading(true);
    const data = await getBankStatementReport(selectedAccountId, from, to);
    setResult(data);
    setLoading(false);
  }

  const totalPaid = result?.payments.reduce((s, p) => s + p.amount, 0) ?? 0;
  const totalWHT = result?.payments.reduce((s, p) => s + (p.prep.totalWithholdingTax ?? 0), 0) ?? 0;

  function handleDownloadCSV() {
    if (!result || result.payments.length === 0) return;
    const headers = ["วันที่", "เลขที่ชำระ", "รายการ / ผู้รับเงิน", "วิธีชำระ", "เลขอ้างอิง", "หัก ณ ที่จ่าย", "เงินออก", "ยอดสะสม"];
    let running = 0;
    const rows = result.payments.map((p) => {
      running += p.amount;
      const vendors = [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", ");
      const wht = p.prep.totalWithholdingTax ?? 0;
      return [
        formatDate(p.paymentDate),
        p.paymentNumber,
        vendors + (p.notes ? ` (${p.notes})` : ""),
        PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
        p.referenceNumber ?? "",
        wht > 0 ? wht : 0,
        p.amount,
        running,
      ];
    });
    const acct = result.account;
    const name = acct ? `${acct.bankName}_${acct.accountNo}_${from}_${to}` : `${from}_${to}`;
    downloadCSV(`Statement_${name}.csv`, headers, rows);
  }

  let runningTotal = 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">รายงานการเดินบัญชีธนาคาร</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1">บัญชีธนาคาร</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} — {a.accountNo} ({a.accountName})
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
          disabled={loading || !selectedAccountId}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "กำลังโหลด..." : "ค้นหา"}
        </button>
        {result && result.payments.length > 0 && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {result === null ? (
        <div className="text-center text-gray-400 text-sm py-12">กรุณาเลือกบัญชีและกดค้นหา</div>
      ) : (
        <>
          {/* Account Info */}
          {result.account && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🏦</span>
                <div>
                  <div className="font-bold text-green-900">{result.account.bankName}</div>
                  {result.account.branch && <div className="text-sm text-green-700">สาขา: {result.account.branch}</div>}
                  <div className="text-sm text-green-700">
                    เลขที่บัญชี: <span className="font-mono font-semibold">{result.account.accountNo}</span>
                    <span className="ml-2">({result.account.accountName})</span>
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    ช่วงเวลา: {formatDate(new Date(from))} — {formatDate(new Date(to))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">จำนวนรายการ</div>
              <div className="text-2xl font-bold text-blue-700">{result.payments.length}</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">หัก ณ ที่จ่ายรวม</div>
              <div className="text-xl font-bold text-orange-700">฿{formatCurrency(totalWHT)}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <div className="text-xs text-red-600 mb-1">ยอดเงินออกรวม</div>
              <div className="text-xl font-bold text-red-700">฿{formatCurrency(totalPaid)}</div>
            </div>
          </div>

          {result.payments.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8 bg-white rounded-xl border border-gray-200">
              ไม่พบรายการในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">วันที่</th>
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขที่ชำระ</th>
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">รายการ / ผู้รับเงิน</th>
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">วิธีชำระ</th>
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">เลขอ้างอิง</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">หัก ณ ที่จ่าย</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600 text-red-600">เงินออก</th>
                    <th className="text-right py-2.5 px-4 font-medium text-gray-600">ยอดสะสม</th>
                  </tr>
                </thead>
                <tbody>
                  {result.payments.map((p) => {
                    runningTotal += p.amount;
                    const vendors = [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", ");
                    const wht = p.prep.totalWithholdingTax ?? 0;
                    return (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{formatDate(p.paymentDate)}</td>
                        <td className="py-2.5 px-4 font-mono text-blue-700 text-xs">{p.paymentNumber}</td>
                        <td className="py-2.5 px-4 text-gray-800">
                          <div>{vendors}</div>
                          {p.notes && <div className="text-xs text-gray-400">{p.notes}</div>}
                        </td>
                        <td className="py-2.5 px-4 text-gray-600">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{p.referenceNumber ?? "-"}</td>
                        <td className="py-2.5 px-4 text-right text-orange-600">
                          {wht > 0 ? `฿${formatCurrency(wht)}` : "-"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-red-600">
                          ฿{formatCurrency(p.amount)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-700">฿{formatCurrency(runningTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                    <td colSpan={5} className="py-2.5 px-4 text-right text-gray-700">รวม</td>
                    <td className="py-2.5 px-4 text-right text-orange-700">฿{formatCurrency(totalWHT)}</td>
                    <td className="py-2.5 px-4 text-right text-red-700">฿{formatCurrency(totalPaid)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-800">฿{formatCurrency(runningTotal)}</td>
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
