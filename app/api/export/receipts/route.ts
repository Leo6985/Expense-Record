import { auth } from "@/auth";
import { getReceipts } from "@/actions/receipts";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "อนุมัติแล้ว",
  CANCELLED: "ยกเลิก",
};

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const receipts = await getReceipts();
  const rows = receipts.map((r) => ({
    "เลขที่ใบรับชำระ": r.receiptNumber,
    "วันที่รับชำระ": r.receiptDate.toISOString().slice(0, 10),
    "บัญชีธนาคาร": `${r.companyBankAccount.bankName} ${r.companyBankAccount.accountNo}`,
    "วิธีชำระ": r.paymentMethod,
    "จำนวนใบกำกับภาษี": r.items.length,
    "ยอดรวม": r.totalAmount,
    "สถานะ": STATUS_LABEL[r.status] ?? r.status,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Receipts");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `receipts_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
