import { auth } from "@/auth";
import { getCashFlow, CashFlowLine } from "@/actions/ledger";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const cf = await getCashFlow({ from, to });

  type Row = { กิจกรรม: string; รายการ: string; จำนวนเงิน: number | string };
  const rows: Row[] = [];
  const push = (act: string, lines: CashFlowLine[], net: number, netLabel: string) => {
    for (const l of lines) rows.push({ กิจกรรม: act, รายการ: l.label, จำนวนเงิน: l.amount });
    rows.push({ กิจกรรม: "", รายการ: netLabel, จำนวนเงิน: net });
  };

  push("ดำเนินงาน", cf.operating, cf.netOperating, "เงินสดสุทธิจากกิจกรรมดำเนินงาน");
  push("ลงทุน", cf.investing, cf.netInvesting, "เงินสดสุทธิจากกิจกรรมลงทุน");
  push("จัดหาเงิน", cf.financing, cf.netFinancing, "เงินสดสุทธิจากกิจกรรมจัดหาเงิน");
  rows.push({ กิจกรรม: "", รายการ: "เงินสดเพิ่มขึ้น(ลดลง)สุทธิ", จำนวนเงิน: cf.netChange });
  rows.push({ กิจกรรม: "", รายการ: "เงินสดต้นงวด", จำนวนเงิน: cf.openingCash });
  rows.push({ กิจกรรม: "", รายการ: "เงินสดปลายงวด", จำนวนเงิน: cf.closingCash });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "CashFlow");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `cash_flow_${from}_${to}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
