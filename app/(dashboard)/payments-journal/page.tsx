"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getPaymentsJournal,
  generatePaymentVouchers,
  PaymentsJournalView,
  GeneratePaymentVouchersResult,
} from "@/actions/payments-journal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

const cell = (n: number) => (n === 0 ? "" : `฿${formatCurrency(n)}`);

const voucherBadge: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง — รออนุมัติ", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
};

export default function PaymentsJournalPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [view, setView] = useState<PaymentsJournalView | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratePaymentVouchersResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setView(await getPaymentsJournal({ from, to }));
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!view) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    try {
      const res = await generatePaymentVouchers({ from: view.from, to: view.to });
      setResult(res);
      setView(await getPaymentsJournal({ from: view.from, to: view.to }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง Voucher ไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  function handleDownloadCSV() {
    if (!view) return;
    const headers = [
      "วันที่", "เลขที่การจ่ายเงิน", "ผู้ขาย",
      "เดบิต เจ้าหนี้", "เครดิต ภาษีหัก ณ ที่จ่าย", "เครดิต ธนาคาร",
      "เลขที่ Voucher", "สถานะ Voucher", "ซ้ำ?",
    ];
    const rows: (string | number)[][] = view.rows.map((r) => [
      formatDate(r.paymentDate),
      r.paymentNumber,
      r.vendorName,
      r.debitAP,
      r.creditWht,
      r.creditBank,
      r.voucherNumber ?? "",
      r.voucherStatus ? voucherBadge[r.voucherStatus]?.label ?? r.voucherStatus : "ยังไม่สร้าง",
      r.duplicate ? "ซ้ำ" : "",
    ]);
    const t = view.totals;
    rows.push(["", "", "รวม", t.debitAP, t.creditWht, t.creditBank, "", "", ""]);
    downloadCSV(`payments_journal_${view.from}_${view.to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สมุดรายวันจ่ายเงิน</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            สร้างใบสำคัญรายวัน (Voucher) อัตโนมัติจากการจ่ายเงิน — หนึ่งรายการจ่ายต่อหนึ่ง Voucher
          </p>
        </div>
        <Link href="/journal-vouchers" className="text-sm text-blue-700 hover:underline font-medium">
          → สมุดรายวันทั่วไป
        </Link>
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
        {view && view.rows.length > 0 && (
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
      ) : view === null ? (
        <div className="text-center text-gray-400 text-sm py-12">เลือกช่วงเวลา แล้วกดค้นหา</div>
      ) : (
        <>
          {view.configMissing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              ยังไม่ได้ตั้งค่าผังบัญชีคุมยอดสำหรับบางรายการ: <span className="font-mono">{view.configMissing.join(", ")}</span>{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link> — รายการที่ขาดจะถูกข้ามตอนสร้าง Voucher
            </div>
          )}
          {view.duplicateGroups.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-4 py-3 text-sm mb-4">
              <div className="font-medium mb-1">⚠ พบการจ่ายเงินที่บัญชีธนาคาร + เลขที่อ้างอิง + ยอดจ่าย ซ้ำกัน</div>
              <ul className="list-disc ml-5">
                {view.duplicateGroups.map((g) => (
                  <li key={g.key}>
                    {g.label} → <span className="font-mono">{g.paymentNumbers.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-xs">ระบบยังสร้าง Voucher ให้ทุกใบ — ตรวจสอบก่อนอนุมัติ</div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
          )}
          {result && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm mb-4">
              สร้าง Voucher ใหม่ {result.created} ใบ · ข้าม (มีอยู่แล้ว) {result.skipped} ใบ
              {result.errors.length > 0 && (
                <ul className="list-disc ml-5 mt-1 text-red-700">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              การจ่ายเงิน {view.rows.length} รายการ · ยังไม่มี Voucher{" "}
              <span className={view.pendingCount > 0 ? "font-semibold text-orange-700" : ""}>{view.pendingCount}</span> รายการ
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || view.pendingCount === 0}
              className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {generating
                ? "กำลังสร้าง..."
                : view.pendingCount === 0
                  ? "สร้าง Voucher ครบแล้ว"
                  : `สร้าง Voucher (${view.pendingCount} ใบ)`}
            </button>
          </div>

          {view.rows.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12 bg-white rounded-xl border border-gray-200">
              ไม่มีการจ่ายเงินในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium">วันที่</th>
                    <th className="text-left px-3 py-2 font-medium">เลขที่การจ่ายเงิน</th>
                    <th className="text-left px-3 py-2 font-medium">ผู้ขาย</th>
                    <th className="text-right px-3 py-2 font-medium border-l border-gray-200">Dr เจ้าหนี้</th>
                    <th className="text-right px-3 py-2 font-medium">Cr ภาษีหัก ณ ที่จ่าย</th>
                    <th className="text-right px-3 py-2 font-medium">Cr ธนาคาร</th>
                    <th className="text-left px-3 py-2 font-medium border-l border-gray-200">Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => {
                    const badge = r.voucherStatus ? voucherBadge[r.voucherStatus] : null;
                    return (
                      <tr key={r.paymentId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(r.paymentDate)}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">
                          {r.paymentNumber}
                          {r.duplicate && (
                            <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                              ซ้ำ
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-800">{r.vendorName}</td>
                        <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-100">{cell(r.debitAP)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{cell(r.creditWht)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{cell(r.creditBank)}</td>
                        <td className="px-3 py-2 border-l border-gray-100 whitespace-nowrap">
                          {r.voucherId ? (
                            <Link href={`/journal-vouchers/${r.voucherId}`} className="inline-flex items-center gap-1.5">
                              <span className="font-mono text-blue-700 hover:underline">{r.voucherNumber}</span>
                              {badge && (
                                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-gray-400">ยังไม่สร้าง</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
                    <td className="px-3 py-2.5" colSpan={3}>รวม</td>
                    <td className="px-3 py-2.5 text-right border-l border-gray-200">฿{formatCurrency(view.totals.debitAP)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(view.totals.creditWht)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(view.totals.creditBank)}</td>
                    <td className="px-3 py-2.5 border-l border-gray-200"></td>
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
