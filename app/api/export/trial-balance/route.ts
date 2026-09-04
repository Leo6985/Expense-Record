import { auth } from "@/auth";
import { getTrialBalance } from "@/actions/ledger";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const result = await getTrialBalance({ from, to });

  const rows = result.rows.map((r) => ({
    "รหัสบัญชี": r.code,
    "ชื่อบัญชี": r.name,
    "ยกมา-เดบิต": r.openingDebit || "",
    "ยกมา-เครดิต": r.openingCredit || "",
    "เดบิต": r.periodDebit || "",
    "เครดิต": r.periodCredit || "",
    "ยกไป-เดบิต": r.closingDebit || "",
    "ยกไป-เครดิต": r.closingCredit || "",
  }));

  const t = result.totals;
  rows.push({
    "รหัสบัญชี": "",
    "ชื่อบัญชี": "รวม",
    "ยกมา-เดบิต": t.openingDebit,
    "ยกมา-เครดิต": t.openingCredit,
    "เดบิต": t.periodDebit,
    "เครดิต": t.periodCredit,
    "ยกไป-เดบิต": t.closingDebit,
    "ยกไป-เครดิต": t.closingCredit,
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "TrialBalance");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `trial_balance_${from}_${to}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
