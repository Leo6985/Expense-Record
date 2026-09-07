import { auth } from "@/auth";
import { getGeneralLedger } from "@/actions/ledger";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const accountId = url.searchParams.get("accountId") ?? "ALL";

  const result = await getGeneralLedger({ accountId, from, to });

  const rows = result.blocks.flatMap((b) => [
    {
      "รหัสบัญชี": b.code,
      "ชื่อบัญชี": b.name,
      "วันที่": "",
      "สมุดรายวัน": "",
      "เลขที่": "",
      "เอกสารต้นทาง": "",
      "รายละเอียด": "ยอดยกมา",
      "เดบิต": "",
      "เครดิต": "",
      "คงเหลือ": b.opening,
    },
    ...b.entries.map((e) => ({
      "รหัสบัญชี": b.code,
      "ชื่อบัญชี": b.name,
      "วันที่": e.date.slice(0, 10),
      "สมุดรายวัน": e.sourceTypeLabel,
      "เลขที่": e.sourceNumber,
      "เอกสารต้นทาง": e.originLabel ?? "",
      "รายละเอียด": e.description,
      "เดบิต": e.debit || "",
      "เครดิต": e.credit || "",
      "คงเหลือ": e.balance,
    })),
    {
      "รหัสบัญชี": b.code,
      "ชื่อบัญชี": b.name,
      "วันที่": "",
      "สมุดรายวัน": "",
      "เลขที่": "",
      "เอกสารต้นทาง": "",
      "รายละเอียด": "รวมเคลื่อนไหว / ยอดยกไป",
      "เดบิต": b.totalDebit,
      "เครดิต": b.totalCredit,
      "คงเหลือ": b.closing,
    },
  ]);

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "GeneralLedger");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `general_ledger_${from}_${to}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
