"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { importVendorsCSV, previewFullSyncDeletions } from "@/actions/vendors";

type VendorRow = {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  creditDays?: number;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
};

type ImportResult = { created: number; updated: number; deleted: number; errors: string[] };
type VendorRef = { id: string; code: string; name: string };
type DeletePreview = { deletable: VendorRef[]; blocked: VendorRef[] };

const HEADERS = [
  "code", "name", "taxId", "address", "contactPerson",
  "phone", "email", "creditDays", "bankName", "bankBranch",
  "bankAccountNo", "bankAccountName",
];

// Accepts either the plain English template headers or the Thai labels used by the "Download" export.
const THAI_LABEL_TO_KEY: Record<string, string> = {
  "รหัส": "code",
  "ชื่อผู้ขาย": "name",
  "เลขประจำตัวผู้เสียภาษี": "taxId",
  "ที่อยู่": "address",
  "ผู้ติดต่อ": "contactPerson",
  "โทรศัพท์": "phone",
  "อีเมล": "email",
  "เครดิต(วัน)": "creditDays",
  "ธนาคาร": "bankName",
  "สาขา": "bankBranch",
  "เลขที่บัญชี": "bankAccountNo",
  "ชื่อบัญชี": "bankAccountName",
};

function normalizeKey(header: string): string | undefined {
  if (THAI_LABEL_TO_KEY[header]) return THAI_LABEL_TO_KEY[header];
  const flat = header.toLowerCase().replace(/\s/g, "");
  return HEADERS.find((h) => h.toLowerCase() === flat);
}

function rowsFromObjects(objects: Record<string, unknown>[]): VendorRow[] {
  return objects.map((obj) => {
    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(obj)) {
      const key = normalizeKey(header);
      if (key) mapped[key] = value === undefined || value === null ? "" : String(value).trim();
    }
    return {
      code: mapped["code"] || "",
      name: mapped["name"] || "",
      taxId: mapped["taxId"] || undefined,
      address: mapped["address"] || undefined,
      contactPerson: mapped["contactPerson"] || undefined,
      phone: mapped["phone"] || undefined,
      email: mapped["email"] || undefined,
      creditDays:
        mapped["creditDays"] !== undefined && mapped["creditDays"] !== "" && !Number.isNaN(parseInt(mapped["creditDays"]))
          ? parseInt(mapped["creditDays"])
          : undefined,
      bankName: mapped["bankName"] || undefined,
      bankBranch: mapped["bankBranch"] || undefined,
      bankAccountNo: mapped["bankAccountNo"] || undefined,
      bankAccountName: mapped["bankAccountName"] || undefined,
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

function parseCSV(text: string): VendorRow[] {
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

async function parseXLSX(file: File): Promise<VendorRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromObjects(objects);
}

export default function VendorCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fullSync, setFullSync] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function loadDeletePreview(parsedRows: VendorRow[]) {
    setPreviewLoading(true);
    try {
      const preview = await previewFullSyncDeletions(parsedRows.map((r) => r.code));
      setDeletePreview(preview);
    } finally {
      setPreviewLoading(false);
    }
  }

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
        setDeletePreview(null);
      } else {
        setParseError("");
        setRows(parsed);
        setResult(null);
        if (fullSync) await loadDeletePreview(parsed);
      }
    } catch {
      setParseError("ไม่สามารถอ่านไฟล์นี้ได้ กรุณาตรวจสอบรูปแบบไฟล์");
      setRows([]);
      setDeletePreview(null);
    }
  }

  async function handleFullSyncToggle(checked: boolean) {
    setFullSync(checked);
    if (checked && rows.length > 0) {
      await loadDeletePreview(rows);
    } else {
      setDeletePreview(null);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;

    if (fullSync && deletePreview && deletePreview.deletable.length > 0) {
      const ok = confirm(
        `โหมด Sync เต็ม: ระบบจะลบผู้ขาย ${deletePreview.deletable.length} รายการที่ไม่มีในไฟล์นี้ออกจากระบบถาวร ยืนยันหรือไม่?`
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      const res = await importVendorsCSV(rows, { fullSync });
      setResult(res);
      setRows([]);
      setDeletePreview(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setRows([]);
    setResult(null);
    setParseError("");
    setFullSync(false);
    setDeletePreview(null);
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">นำเข้า / ส่งออกข้อมูลผู้ขาย</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Download current data */}
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href="/api/export/vendors"
                  className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium"
                >
                  ⬇ ดาวน์โหลดข้อมูลผู้ขายปัจจุบันทั้งหมด (.xlsx)
                </a>
              </div>

              {/* Template + Upload */}
              <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
                <a
                  href="/api/templates/vendors"
                  download="vendor_template.csv"
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

              {/* Full sync toggle */}
              <label className="flex items-start gap-2 pt-2 border-t border-gray-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fullSync}
                  onChange={(e) => handleFullSyncToggle(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">โหมด Sync เต็ม</span> — ลบผู้ขายที่มีอยู่ในระบบแต่{" "}
                  <span className="underline">ไม่มีรหัสอยู่ในไฟล์นี้</span> ออกจากระบบ (ผู้ขายที่มีใบสั่งซื้อ/ใบตั้งหนี้ผูกอยู่จะถูกข้ามไม่ลบให้อัตโนมัติ)
                </span>
              </label>

              {/* Format hint */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 font-mono break-all">
                {HEADERS.join(",")}
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{parseError}</div>
              )}

              {/* Full sync deletion preview */}
              {fullSync && rows.length > 0 && (
                previewLoading ? (
                  <div className="text-sm text-gray-400">กำลังตรวจสอบรายการที่จะลบ...</div>
                ) : deletePreview && (deletePreview.deletable.length > 0 || deletePreview.blocked.length > 0) ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm space-y-2">
                    {deletePreview.deletable.length > 0 && (
                      <div>
                        <p className="font-semibold text-red-700 mb-1">
                          จะลบผู้ขาย {deletePreview.deletable.length} รายการที่ไม่มีในไฟล์นี้:
                        </p>
                        <ul className="text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                          {deletePreview.deletable.map((v) => (
                            <li key={v.id}>• {v.code} — {v.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {deletePreview.blocked.length > 0 && (
                      <div>
                        <p className="font-semibold text-yellow-700 mb-1">
                          ข้ามการลบ {deletePreview.blocked.length} รายการ (มีใบสั่งซื้อ/ใบตั้งหนี้ผูกอยู่):
                        </p>
                        <ul className="text-yellow-700 space-y-0.5 max-h-32 overflow-y-auto">
                          {deletePreview.blocked.map((v) => (
                            <li key={v.id}>• {v.code} — {v.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">ไม่มีผู้ขายที่ต้องลบ — ทุกรหัสในระบบมีอยู่ในไฟล์นี้แล้ว</div>
                )
              )}

              {/* Result */}
              {result && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${result.errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
                  <p className="font-semibold mb-1 text-gray-800">นำเข้าเสร็จสิ้น</p>
                  <p className="text-green-700">
                    สร้างใหม่ {result.created} รายการ · อัปเดต {result.updated} รายการ
                    {result.deleted > 0 && <> · ลบ {result.deleted} รายการ</>}
                  </p>
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
                          {["รหัส", "ชื่อผู้ขาย", "เลขประจำตัวผู้เสียภาษี", "ผู้ติดต่อ", "อีเมล", "เครดิต(วัน)", "เลขบัญชีธนาคาร"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 font-mono text-blue-700">{r.code}</td>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.taxId || "-"}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.contactPerson || "-"}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.email || "-"}</td>
                            <td className="px-3 py-1.5 text-center">{r.creditDays ?? 30}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-500">{r.bankAccountNo || "-"}</td>
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

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={handleClose} className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm hover:bg-gray-50">
                ปิด
              </button>
              {rows.length > 0 && (
                <button
                  onClick={handleImport}
                  disabled={loading || previewLoading}
                  className={`text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                    fullSync && deletePreview && deletePreview.deletable.length > 0
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {loading
                    ? "กำลังนำเข้า..."
                    : fullSync && deletePreview && deletePreview.deletable.length > 0
                    ? `ยืนยันนำเข้า ${rows.length} รายการ + ลบ ${deletePreview.deletable.length} รายการ`
                    : `ยืนยันนำเข้า ${rows.length} รายการ`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
