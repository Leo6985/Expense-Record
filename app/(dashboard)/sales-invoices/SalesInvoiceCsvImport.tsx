"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { importSalesInvoicesCSV } from "@/actions/sales-invoices";

type InvoiceRow = {
  invoiceDate: string;
  invoiceNumber: string;
  customerName: string;
  amount?: number;
  discountAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
};

type ImportResult = {
  created: number;
  updated: number;
  customersCreated: number;
  skipped: number;
  errors: string[];
};

const HEADERS = ["invoiceDate", "invoiceNumber", "customerName", "amount", "discountAmount", "vatAmount", "totalAmount"];

const THAI_LABEL_TO_KEY: Record<string, string> = {
  "วันที่ใบกำกับภาษี": "invoiceDate",
  "เลขที่ใบกำกับภาษี": "invoiceNumber",
  "รายชื่อลูกค้า": "customerName",
  "ยอดก่อนภาษี": "amount",
  "ส่วนลด": "discountAmount",
  "ภาษีมูลค่าเพิ่ม": "vatAmount",
  "ยอดรวม": "totalAmount",
};

function normalizeKey(header: string): string | undefined {
  if (THAI_LABEL_TO_KEY[header]) return THAI_LABEL_TO_KEY[header];
  const flat = header.toLowerCase().replace(/\s/g, "");
  return HEADERS.find((h) => h.toLowerCase() === flat);
}

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

function rowsFromObjects(objects: Record<string, unknown>[]): InvoiceRow[] {
  return objects.map((obj) => {
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(obj)) {
      const key = normalizeKey(header);
      if (key) mapped[key] = value;
    }
    return {
      invoiceDate: toDateString(mapped["invoiceDate"]),
      invoiceNumber: String(mapped["invoiceNumber"] ?? "").trim(),
      customerName: String(mapped["customerName"] ?? "").trim(),
      amount: toNumber(mapped["amount"]),
      discountAmount: toNumber(mapped["discountAmount"]),
      vatAmount: toNumber(mapped["vatAmount"]),
      totalAmount: toNumber(mapped["totalAmount"]),
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): InvoiceRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const objects = lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
  return rowsFromObjects(objects);
}

async function parseXLSX(file: File): Promise<InvoiceRow[]> {
  const buffer = await file.arrayBuffer();
  // cellDates so date-formatted cells arrive as JS Date objects instead of Excel serial numbers.
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromObjects(objects);
}

export default function SalesInvoiceCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed = isExcel ? await parseXLSX(file) : parseCSV(await file.text());

      if (parsed.length === 0) {
        setParseError("ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง");
        setRows([]);
      } else {
        setParseError("");
        setRows(parsed);
        setResult(null);
      }
    } catch {
      setParseError("ไม่สามารถอ่านไฟล์นี้ได้ กรุณาตรวจสอบรูปแบบไฟล์");
      setRows([]);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const res = await importSalesInvoicesCSV(rows);
      setResult(res);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setRows([]);
    setResult(null);
    setParseError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
      >
        นำเข้าข้อมูลการขาย
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">นำเข้าข้อมูลใบกำกับภาษีขาย</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href="/api/export/sales-invoices"
                  className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium"
                >
                  ⬇ ดาวน์โหลดข้อมูลใบกำกับภาษีขายปัจจุบันทั้งหมด (.xlsx)
                </a>
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
                <a
                  href="/api/templates/sales-invoices"
                  download="sales_invoice_template.csv"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  ⬇ ดาวน์โหลด Template CSV เปล่า
                </a>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  เลือกไฟล์เพื่อนำเข้า
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={handleFile}
                />
                <span className="text-xs text-gray-400">รองรับ .csv (UTF-8) และ .xlsx · ถ้าเลขที่ใบกำกับภาษีซ้ำจะอัปเดตข้อมูล (ยกเว้นที่ตัดชำระแล้ว) · ไม่พบชื่อลูกค้าจะสร้างลูกค้าใหม่ให้อัตโนมัติ</span>
              </div>

              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500">
                <p className="font-semibold text-gray-600 mb-1">คอลัมน์ที่รองรับ</p>
                <code className="font-mono break-all">วันที่ใบกำกับภาษี, เลขที่ใบกำกับภาษี, รายชื่อลูกค้า, ยอดก่อนภาษี, ส่วนลด, ภาษีมูลค่าเพิ่ม, ยอดรวม</code>
                <p className="mt-1 text-gray-400">รูปแบบวันที่: YYYY-MM-DD (เช่น 2026-08-01) หรือ DD/MM/YYYY (เช่น 01/08/2026)</p>
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{parseError}</div>
              )}

              {result && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${result.errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
                  <p className="font-semibold mb-1 text-gray-800">นำเข้าเสร็จสิ้น</p>
                  <p className="text-green-700">
                    สร้างใหม่ {result.created} รายการ · อัปเดต {result.updated} รายการ
                    {result.customersCreated > 0 && <> · สร้างลูกค้าใหม่ {result.customersCreated} ราย</>}
                    {result.skipped > 0 && <> · ข้าม {result.skipped} รายการ</>}
                  </p>
                  {result.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-red-600">
                      {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">ตัวอย่างข้อมูลที่จะนำเข้า ({rows.length} แถว)</p>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["วันที่", "เลขที่ใบกำกับภาษี", "ลูกค้า", "ก่อนภาษี", "ส่วนลด", "VAT", "รวม"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.invoiceDate || "-"}</td>
                            <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{r.invoiceNumber}</td>
                            <td className="px-3 py-1.5">{r.customerName}</td>
                            <td className="px-3 py-1.5 text-right">{r.amount ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right">{r.discountAmount ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right">{r.vatAmount ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{r.totalAmount ?? "-"}</td>
                          </tr>
                        ))}
                        {rows.length > 10 && (
                          <tr><td colSpan={7} className="px-3 py-2 text-center text-gray-400">... และอีก {rows.length - 10} แถว</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={handleClose} className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm hover:bg-gray-50">
                ปิด
              </button>
              {rows.length > 0 && (
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${rows.length} รายการ`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
