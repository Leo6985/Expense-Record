import { auth } from "@/auth";
import { getChartOfAccounts } from "@/actions/chart-of-accounts";
import * as XLSX from "xlsx";

const HEADERS: [string, string][] = [
  ["code", "รหัสบัญชี"],
  ["name", "ชื่อบัญชี"],
  ["type", "ประเภท"],
  ["isActive", "ใช้งานอยู่"],
];

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const accounts = await getChartOfAccounts();
  const rows = accounts.map((a) => {
    const row: Record<string, string> = {};
    for (const [key, label] of HEADERS) {
      const value = (a as unknown as Record<string, unknown>)[key];
      row[label] = value === null || value === undefined ? "" : String(value);
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS.map(([, label]) => label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ChartOfAccounts");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `chart_of_accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
