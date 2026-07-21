"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { importProductsCSV } from "@/actions/products";

type ProductRow = {
  code: string;
  name: string;
  description?: string;
  unit?: string;
  accountCode?: string;
};

type ImportResult = { created: number; updated: number; errors: string[] };

const HEADERS = ["code", "name", "description", "unit", "accountCode"];

const THAI_LABEL_TO_KEY: Record<string, string> = {
  "รหัส": "code",
  "ชื่อสินค้า": "name",
  "คำอธิบาย": "description",
  "หน่วย": "unit",
  "รหัสผังบัญชี": "accountCode",
};

function normalizeKey(header: string): string | undefined {
  if (THAI_LABEL_TO_KEY[header]) return THAI_LABEL_TO_KEY[header];
  const flat = header.toLowerCase().replace(/\s/g, "");
  return HEADERS.find((h) => h.toLowerCase() === flat);
}

function rowsFromObjects(objects: Record<string, unknown>[]): ProductRow[] {
  return objects.map((obj) => {
    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(obj)) {
      const key = normalizeKey(header);
      if (key) mapped[key] = value === undefined || value === null ? "" : String(value).trim();
    }
    return {
      code: mapped["code"] || "",
      name: mapped["name"] || "",
      description: mapped["description"] || undefined,
      unit: mapped["unit"] || undefined,
      accountCode: mapped["accountCode"] || undefined,
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

function parseCSV(text: string): ProductRow[] {
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

async function parseXLSX(file: File): Promise<ProductRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromObjects(objects);
}

export default function ProductCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductRow[]>([]);
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
      const res = await importProductsCSV(rows);
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
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        นำเข้า / ส่งออกข้อมูล
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">นำเข้า / ส่งออกสินค้าและบริการ</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Download current data */}
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href="/api/export/products"
                  className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium"
                >
                  ⬇ ดาวน์โหลดข้อมูลสินค้าปัจจุบันทั้งหมด (.xlsx)
                </a>
              </div>

              {/* Template + Upload */}
              <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
                <a
                  href="/api/templates/products"
                  download="product_template.csv"
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
                <span className="text-xs text-gray-400">รองรับ .csv (UTF-8) และ .xlsx · ถ้ารหัสซ้ำจะอัปเดตข้อมูล</span>
              </div>

              {/* Format hint */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500">
                <p className="font-semibold text-gray-600 mb-1">คอลัมน์ที่รองรับ</p>
                <code className="font-mono">code, name, description, unit, accountCode</code>
                <p className="mt-1 text-gray-400">accountCode คือรหัสผังบัญชีที่มีอยู่ในระบบ (ไม่บังคับ)</p>
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{parseError}</div>
              )}

              {/* Result */}
              {result && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${result.errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
                  <p className="font-semibold mb-1 text-gray-800">นำเข้าเสร็จสิ้น</p>
                  <p className="text-green-700">สร้างใหม่ {result.created} รายการ · อัปเดต {result.updated} รายการ</p>
                  {result.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-red-600">
                      {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Preview table */}
              {rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">ตัวอย่างข้อมูลที่จะนำเข้า ({rows.length} แถว)</p>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {["รหัส", "ชื่อสินค้า", "คำอธิบาย", "หน่วย", "รหัสผังบัญชี"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{r.code}</td>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.description || "-"}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.unit || "-"}</td>
                            <td className="px-3 py-1.5 font-mono text-blue-600">{r.accountCode || "-"}</td>
                          </tr>
                        ))}
                        {rows.length > 10 && (
                          <tr><td colSpan={5} className="px-3 py-2 text-center text-gray-400">... และอีก {rows.length - 10} แถว</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
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
