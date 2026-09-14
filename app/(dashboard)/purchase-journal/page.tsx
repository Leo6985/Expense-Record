"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPurchaseJournal,
  generatePurchaseVouchers,
  PurchaseJournalView,
  GeneratePurchaseVouchersResult,
} from "@/actions/purchase-journal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";
import JournalPreviewPanel from "@/components/JournalPreviewPanel";

const cell = (n: number) => (n === 0 ? "" : `฿${formatCurrency(n)}`);

const voucherBadge: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง — รออนุมัติ", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
};

export default function PurchaseJournalPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [docSearch, setDocSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<PurchaseJournalView | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratePurchaseVouchersResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!view) return [];
    const q = docSearch.trim().toLowerCase();
    if (!q) return view.rows;
    return view.rows.filter(
      (r) => r.apNumber.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q)
    );
  }, [view, docSearch]);

  const filteredTotals = useMemo(
    () =>
      filteredRows.reduce(
        (t, r) => ({
          creditAP: t.creditAP + r.creditAP,
          debitVat: t.debitVat + r.debitVat,
          debitExpense: t.debitExpense + r.debitExpense,
        }),
        { creditAP: 0, debitVat: 0, debitExpense: 0 }
      ),
    [filteredRows]
  );

  async function handleSearch() {
    setLoading(true);
    setResult(null);
    setError(null);
    setDocSearch("");
    try {
      setView(await getPurchaseJournal({ from, to }));
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
      const res = await generatePurchaseVouchers({ from: view.from, to: view.to });
      setResult(res);
      setView(await getPurchaseJournal({ from: view.from, to: view.to }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง Voucher ไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  function handleDownloadCSV() {
    if (!view) return;
    const headers = [
      "วันที่", "เลขที่ใบตั้งหนี้", "เลขที่ใบกำกับ", "ผู้ขาย", "ที่มา",
      "เดบิต ภาษีซื้อ", "เดบิต ค่าใช้จ่าย/สินค้า", "เครดิต เจ้าหนี้",
      "เลขที่ Voucher", "สถานะ Voucher", "ซ้ำ?",
    ];
    const rows: (string | number)[][] = filteredRows.map((r) => [
      formatDate(r.invoiceDate),
      r.apNumber,
      r.invoiceNumber,
      r.vendorName,
      r.source === "GR" ? "รับสินค้า" : "บันทึกตรง/นำเข้า",
      r.debitVat,
      r.debitExpense,
      r.creditAP,
      r.voucherNumber ?? "",
      r.voucherStatus ? voucherBadge[r.voucherStatus]?.label ?? r.voucherStatus : "ยังไม่สร้าง",
      r.duplicate ? "ซ้ำ" : "",
    ]);
    rows.push(["", "", "", "รวม", "", filteredTotals.debitVat, filteredTotals.debitExpense, filteredTotals.creditAP, "", "", ""]);
    downloadCSV(`purchase_journal_${view.from}_${view.to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สมุดรายวันซื้อ</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            สร้างใบสำคัญรายวัน (Voucher) อัตโนมัติจากใบตั้งหนี้ — ทั้งจากอัพโหลดใบกำกับภาษีซื้อและจากการคีย์รับสินค้า
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
        {view && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ค้นเลขที่เอกสาร</label>
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="เลขที่ใบตั้งหนี้ / เลขที่ใบกำกับ"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
        )}
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
              ยังไม่ได้ตั้งค่าผังบัญชีคุมยอด: <span className="font-mono">{view.configMissing.join(", ")}</span> —
              ต้องตั้งค่าก่อนจึงจะสร้าง Voucher ได้{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link>
            </div>
          )}
          {view.duplicateGroups.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-4 py-3 text-sm mb-4">
              <div className="font-medium mb-1">⚠ พบใบตั้งหนี้ที่ผู้ขาย + เลขที่ใบกำกับซ้ำกัน (อาจบันทึกซ้ำจากทั้งอัพโหลดและรับสินค้า)</div>
              <ul className="list-disc ml-5">
                {view.duplicateGroups.map((g) => (
                  <li key={g.key}>
                    {g.vendorName} · ใบกำกับ <span className="font-mono">{g.invoiceNumber}</span> →{" "}
                    <span className="font-mono">{g.apNumbers.join(", ")}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-xs">ระบบยังสร้าง Voucher ให้ทุกใบ — ตรวจสอบและยกเลิกใบที่ซ้ำก่อนอนุมัติ</div>
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
              ใบตั้งหนี้ {filteredRows.length} ใบ{docSearch.trim() && ` (จากทั้งหมด ${view.rows.length} ใบ)`} · ยังไม่มี Voucher{" "}
              <span className={view.pendingCount > 0 ? "font-semibold text-orange-700" : ""}>{view.pendingCount}</span> ใบ
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || view.pendingCount === 0 || view.configMissing.length > 0}
              className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {generating
                ? "กำลังสร้าง..."
                : view.pendingCount === 0
                  ? "สร้าง Voucher ครบแล้ว"
                  : `สร้าง Voucher (${view.pendingCount} ใบ)`}
            </button>
          </div>

          {filteredRows.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12 bg-white rounded-xl border border-gray-200">
              {docSearch.trim() ? "ไม่พบเลขที่เอกสารที่ค้นหา" : "ไม่มีใบตั้งหนี้ในช่วงเวลาที่เลือก"}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    <th className="px-3 py-2 font-medium w-8"></th>
                    <th className="text-left px-3 py-2 font-medium">วันที่</th>
                    <th className="text-left px-3 py-2 font-medium">เลขที่ใบตั้งหนี้</th>
                    <th className="text-left px-3 py-2 font-medium">เลขที่ใบกำกับ</th>
                    <th className="text-left px-3 py-2 font-medium">ผู้ขาย</th>
                    <th className="text-left px-3 py-2 font-medium">ที่มา</th>
                    <th className="text-right px-3 py-2 font-medium border-l border-gray-200">เดบิต ภาษีซื้อ</th>
                    <th className="text-right px-3 py-2 font-medium">เดบิต ค่าใช้จ่าย/สินค้า</th>
                    <th className="text-right px-3 py-2 font-medium">เครดิต เจ้าหนี้</th>
                    <th className="text-left px-3 py-2 font-medium border-l border-gray-200">Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const badge = r.voucherStatus ? voucherBadge[r.voucherStatus] : null;
                    const isExpanded = expandedId === r.apId;
                    return (
                      <Fragment key={r.apId}>
                        <tr className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : r.apId)}
                              className="text-gray-400 hover:text-blue-600"
                              title="ดูตัวอย่างการบันทึกบัญชี"
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(r.invoiceDate)}</td>
                          <td className="px-3 py-2 font-mono text-gray-700">{r.apNumber}</td>
                          <td className="px-3 py-2 font-mono text-gray-700">
                            {r.invoiceNumber}
                            {r.duplicate && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                                ซ้ำ
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-800">{r.vendorName}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {r.source === "GR" ? "รับสินค้า" : "บันทึกตรง/นำเข้า"}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 border-l border-gray-100">{cell(r.debitVat)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{cell(r.debitExpense)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{cell(r.creditAP)}</td>
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
                        {isExpanded && (
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <td></td>
                            <td colSpan={9} className="px-3 py-3">
                              <JournalPreviewPanel lines={r.journalPreview} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300 text-gray-900">
                    <td className="px-3 py-2.5" colSpan={6}>รวม</td>
                    <td className="px-3 py-2.5 text-right border-l border-gray-200">฿{formatCurrency(filteredTotals.debitVat)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(filteredTotals.debitExpense)}</td>
                    <td className="px-3 py-2.5 text-right">฿{formatCurrency(filteredTotals.creditAP)}</td>
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
