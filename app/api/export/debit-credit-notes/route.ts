import { auth } from "@/auth";
import { getDebitCreditNotes } from "@/actions/debit-credit-notes";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "อนุมัติแล้ว",
  CANCELLED: "ยกเลิก",
};

const TYPE_LABEL: Record<string, string> = {
  DEBIT: "ใบเพิ่มหนี้",
  CREDIT: "ใบลดหนี้",
};

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const notes = await getDebitCreditNotes();
  const rows = notes.map((n) => ({
    "เลขที่": n.noteNumber,
    "ประเภท": TYPE_LABEL[n.type] ?? n.type,
    "วันที่": n.noteDate.toISOString().slice(0, 10),
    "เลขที่ใบกำกับภาษีอ้างอิง": n.invoice.invoiceNumber,
    "ลูกค้า": n.invoice.customer.name,
    "ยอดก่อนภาษี": n.amount,
    "ภาษีมูลค่าเพิ่ม": n.vatAmount,
    "ยอดรวม": n.totalAmount,
    "เหตุผล": n.reason ?? "",
    "สถานะ": STATUS_LABEL[n.status] ?? n.status,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "DebitCreditNotes");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `debit_credit_notes_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
