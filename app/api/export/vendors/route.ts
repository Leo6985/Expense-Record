import { auth } from "@/auth";
import { getVendors } from "@/actions/vendors";
import * as XLSX from "xlsx";

const HEADERS: [string, string][] = [
  ["code", "รหัส"],
  ["name", "ชื่อผู้ขาย"],
  ["taxId", "เลขประจำตัวผู้เสียภาษี"],
  ["address", "ที่อยู่"],
  ["contactPerson", "ผู้ติดต่อ"],
  ["phone", "โทรศัพท์"],
  ["email", "อีเมล"],
  ["creditDays", "เครดิต(วัน)"],
  ["bankName", "ธนาคาร"],
  ["bankBranch", "สาขา"],
  ["bankAccountNo", "เลขที่บัญชี"],
  ["bankAccountName", "ชื่อบัญชี"],
  ["isActive", "ใช้งานอยู่"],
];

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const vendors = await getVendors();
  const rows = vendors.map((v) => {
    const row: Record<string, string | number> = {};
    for (const [key, label] of HEADERS) {
      const value = (v as unknown as Record<string, unknown>)[key];
      row[label] = value === null || value === undefined ? "" : String(value);
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS.map(([, label]) => label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Vendors");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `vendors_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
