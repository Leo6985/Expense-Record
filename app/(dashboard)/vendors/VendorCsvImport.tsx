"use client";

import { useRef, useState } from "react";
import { importVendorsCSV } from "@/actions/vendors";

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

type ImportResult = { created: number; updated: number; errors: string[] };

const HEADERS = [
  "code", "name", "taxId", "address", "contactPerson",
  "phone", "email", "creditDays", "bankName", "bankBranch",
  "bankAccountNo", "bankAccountName",
];


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
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, ""));
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return {
      code: obj["code"] || "",
      name: obj["name"] || "",
      taxId: obj["taxid"] || undefined,
      address: obj["address"] || undefined,
      contactPerson: obj["contactperson"] || undefined,
      phone: obj["phone"] || undefined,
      email: obj["email"] || undefined,
      creditDays: obj["creditdays"] !== "" && !Number.isNaN(parseInt(obj["creditdays"]))
        ? parseInt(obj["creditdays"])
        : undefined,
      bankName: obj["bankname"] || undefined,
      bankBranch: obj["bankbranch"] || undefined,
      bankAccountNo: obj["bankaccountno"] || undefined,
      bankAccountName: obj["bankaccountname"] || undefined,
    };
  });
}


export default function VendorCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setParseError("ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง");
        setRows([]);
      } else {
        setParseError("");
        setRows(parsed);
        setResult(null);
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const res = await importVendorsCSV(rows);
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
        นำเข้า CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">นำเข้าข้อมูลผู้ขาย (CSV)</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Template + Upload */}
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href="/api/templates/vendors"
                  download="vendor_template.csv"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  ⬇ ดาวน์โหลด Template CSV
                </a>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  เลือกไฟล์ CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                <span className="text-xs text-gray-400">รองรับ .csv (UTF-8) · ถ้ารหัสซ้ำจะอัปเดตข้อมูล</span>
              </div>

              {/* Format hint */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 font-mono break-all">
                {HEADERS.join(",")}
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
                          {["รหัส", "ชื่อผู้ขาย", "เลขผู้เสียภาษี", "ผู้ติดต่อ", "อีเมล", "เครดิต(วัน)", "เลขบัญชีธนาคาร"].map((h) => (
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
