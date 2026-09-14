"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { importReceiptsCSV } from "@/actions/receipts";

type ReceiptRow = {
  receiptDate: string;
  recordedDate?: string;
  invoiceNumber: string;
  companyBankAccountNo: string;
  paymentMethod?: string;
  referenceNumber?: string;
  amount?: number;
  feeAmount?: number;
  withholdingTaxAmount?: number;
  withholdingTaxCertNumber?: string;
  actualReceivedAmount?: number;
  notes?: string;
};

type ImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

const HEADERS = [
  "receiptDate", "recordedDate", "invoiceNumber", "companyBankAccountNo", "paymentMethod",
  "referenceNumber", "amount", "feeAmount", "withholdingTaxAmount", "withholdingTaxCertNumber",
  "actualReceivedAmount", "notes",
];

const THAI_LABEL_TO_KEY: Record<string, string> = {
  "วันที่รับชำระ": "receiptDate",
  "วันที่บันทึก": "recordedDate",
  "เลขที่ใบกำกับภาษีขาย": "invoiceNumber",
  "เลขบัญชีธนาคาร": "companyBankAccountNo",
  "วิธีการชำระ": "paymentMethod",
  "เลขที่อ้างอิง": "referenceNumber",
  "จำนวนเงิน": "amount",
  "ค่าธรรมเนียม": "feeAmount",
  "ภาษีหัก ณ ที่จ่าย": "withholdingTaxAmount",
  "เลขที่หนังสือรับรองหัก ณ ที่จ่าย": "withholdingTaxCertNumber",
  "ยอดรับจริง": "actualReceivedAmount",
  "หมายเหตุ": "notes",
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

function rowsFromObjects(objects: Record<string, unknown>[]): ReceiptRow[] {
  return objects.map((obj) => {
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(obj)) {
      const key = normalizeKey(header);
      if (key) mapped[key] = value;
    }
    return {
      receiptDate: toDateString(mapped["receiptDate"]),
      recordedDate: toDateString(mapped["recordedDate"]) || undefined,
      invoiceNumber: String(mapped["invoiceNumber"] ?? "").trim(),
      companyBankAccountNo: String(mapped["companyBankAccountNo"] ?? "").trim(),
      paymentMethod: String(mapped["paymentMethod"] ?? "").trim() || undefined,
      referenceNumber: String(mapped["referenceNumber"] ?? "").trim() || undefined,
      amount: toNumber(mapped["amount"]),
      feeAmount: toNumber(mapped["feeAmount"]),
      withholdingTaxAmount: toNumber(mapped["withholdingTaxAmount"]),
      withholdingTaxCertNumber: String(mapped["withholdingTaxCertNumber"] ?? "").trim() || undefined,
      actualReceivedAmount: toNumber(mapped["actualReceivedAmount"]),
      notes: String(mapped["notes"] ?? "").trim() || undefined,
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

function parseCSV(text: string): ReceiptRow[] {
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

async function parseXLSX(file: File): Promise<ReceiptRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromObjects(objects);
}

export default function ReceiptsCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showComplete, setShowComplete] = useState(false);

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
        await handleImport(parsed);
      }
    } catch {
      setParseError("ไม่สามารถอ่านไฟล์นี้ได้ กรุณาตรวจสอบรูปแบบไฟล์");
      setRows([]);
    }
  }

  async function handleImport(rowsToImport: ReceiptRow[] = rows) {
    if (rowsToImport.length === 0) return;
    setLoading(true);
    try {
      const res = await importReceiptsCSV(rowsToImport);
      setResult(res);
      setRows([]);
      if (res.errors.length === 0) {
        setShowComplete(true);
        setTimeout(handleClose, 1800);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setRows([]);
    setResult(null);
    setParseError("");
    setShowComplete(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
      >
        อัพโหลดรายละเอียดการชำระ
      </button>

      {showComplete && result && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <div className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-full bg-green-100 text-green-600 text-3xl">
              ✓
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">อัพโหลดข้อมูลสมบูรณ์</h3>
            <p className="text-sm text-gray-500 mb-5">
              บันทึกการรับชำระใหม่ {result.created} รายการ
              {result.skipped > 0 && <> · ข้าม {result.skipped} รายการ</>}
            </p>
            <button
              onClick={handleClose}
              className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 rounded-2xl">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-600 font-medium">กำลังอัปโหลดข้อมูล...</p>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">อัพโหลดรายละเอียดการชำระ</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href="/api/templates/receipts"
                  download="receipts_template.csv"
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
                <span className="text-xs text-gray-400">รองรับ .csv (UTF-8) และ .xlsx · หนึ่งแถวต่อหนึ่งใบกำกับภาษีขายที่ตัดชำระ</span>
              </div>

              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500">
                <p className="font-semibold text-gray-600 mb-1">คอลัมน์ที่รองรับ</p>
                <code className="font-mono break-all">
                  วันที่รับชำระ, วันที่บันทึก, เลขที่ใบกำกับภาษีขาย, เลขบัญชีธนาคาร, วิธีการชำระ, เลขที่อ้างอิง,
                  จำนวนเงิน, ค่าธรรมเนียม, ภาษีหัก ณ ที่จ่าย, เลขที่หนังสือรับรองหัก ณ ที่จ่าย, ยอดรับจริง, หมายเหตุ
                </code>
                <p className="mt-1 text-gray-400">รูปแบบวันที่: YYYY-MM-DD (เช่น 2026-08-01) หรือ DD/MM/YYYY (เช่น 01/08/2026)</p>
                <p className="mt-1 text-gray-400">
                  &quot;เลขที่ใบกำกับภาษีขาย&quot; ต้องมีอยู่ในระบบแล้ว และ &quot;เลขบัญชีธนาคาร&quot; ต้องตรงกับบัญชีบริษัทที่ตั้งไว้
                </p>
                <p className="mt-1 text-gray-400">
                  ไม่ระบุ &quot;จำนวนเงิน&quot; จะตัดชำระเต็มยอดคงเหลือของใบกำกับให้อัตโนมัติ · ไม่ระบุ &quot;ยอดรับจริง&quot; จะถือว่าไม่มีเงินขาด/เกิน
                </p>
                <p className="mt-1 text-gray-400">
                  รองรับได้เฉพาะการตัดชำระ 1 ใบกำกับต่อ 1 แถว — ถ้าต้องการรวมหลายใบกำกับในการรับชำระเดียวกัน ให้ใช้ฟอร์มบันทึกด้วยตนเองแทน
                </p>
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{parseError}</div>
              )}

              {result && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${result.errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
                  <p className="font-semibold mb-1 text-gray-800">นำเข้าเสร็จสิ้น</p>
                  <p className="text-green-700">
                    บันทึกการรับชำระใหม่ {result.created} รายการ
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
                  <p className="text-sm font-medium text-gray-700 mb-2">กำลังนำเข้าข้อมูล ({rows.length} แถว)</p>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["วันที่", "เลขที่ใบกำกับ", "เลขบัญชี", "วิธีชำระ", "จำนวนเงิน", "ค่าธรรมเนียม", "หัก ณ ที่จ่าย", "ยอดรับจริง"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.receiptDate || "-"}</td>
                            <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{r.invoiceNumber}</td>
                            <td className="px-3 py-1.5 font-mono">{r.companyBankAccountNo}</td>
                            <td className="px-3 py-1.5">{r.paymentMethod ?? "โอนเงิน"}</td>
                            <td className="px-3 py-1.5 text-right">{r.amount ?? "(เต็มยอด)"}</td>
                            <td className="px-3 py-1.5 text-right">{r.feeAmount ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right">{r.withholdingTaxAmount ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{r.actualReceivedAmount ?? "-"}</td>
                          </tr>
                        ))}
                        {rows.length > 10 && (
                          <tr><td colSpan={8} className="px-3 py-2 text-center text-gray-400">... และอีก {rows.length - 10} แถว</td></tr>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
