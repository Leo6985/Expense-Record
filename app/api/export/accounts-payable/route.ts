import { auth } from "@/auth";
import { getAccountsPayable } from "@/actions/accounts-payable";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const aps = await getAccountsPayable();
  const rows = aps.map((ap) => ({
    "เลขที่ AP": ap.apNumber,
    "ผู้ขาย": ap.vendor.name,
    "เลขที่ PO": ap.po?.poNumber ?? "",
    "เลขที่ GR": ap.gr?.grNumber ?? "",
    "เลขที่ใบแจ้งหนี้": ap.invoiceNumber,
    "หมวดบัญชี": ap.account ? `${ap.account.code} — ${ap.account.name}` : "",
    "วันครบกำหนด": ap.dueDate.toISOString().slice(0, 10),
    "มูลค่ารวม": ap.totalAmount,
    "สถานะ": ap.status,
    "หมายเหตุ": ap.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "AccountsPayable");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `accounts_payable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
