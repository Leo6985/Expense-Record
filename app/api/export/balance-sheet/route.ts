import { auth } from "@/auth";
import { getBalanceSheet } from "@/actions/ledger";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);

  const bs = await getBalanceSheet({ asOf });

  type Row = { หมวด: string; รหัสบัญชี: string; ชื่อบัญชี: string; จำนวนเงิน: number | string };
  const rows: Row[] = [];
  const line = (หมวด: string, รหัสบัญชี: string, ชื่อบัญชี: string, จำนวนเงิน: number | string) =>
    rows.push({ หมวด, รหัสบัญชี, ชื่อบัญชี, จำนวนเงิน });

  for (const r of bs.assets) line("สินทรัพย์", r.code, r.name, r.amount);
  line("", "", "รวมสินทรัพย์", bs.totalAssets);
  for (const r of bs.liabilities) line("หนี้สิน", r.code, r.name, r.amount);
  line("", "", "รวมหนี้สิน", bs.totalLiabilities);
  for (const r of bs.equity) line("ส่วนของผู้ถือหุ้น", r.code, r.name, r.amount);
  line("ส่วนของผู้ถือหุ้น", "", "กำไร(ขาดทุน)สะสม", bs.retainedEarnings);
  line("", "", "รวมส่วนของผู้ถือหุ้น", bs.totalEquity);
  line("", "", "รวมหนี้สินและส่วนของผู้ถือหุ้น", bs.totalLiabilities + bs.totalEquity);
  for (const r of bs.unclassified) line("ยังไม่จัดหมวด", r.code, r.name, r.amount);

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "BalanceSheet");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `balance_sheet_${asOf}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
