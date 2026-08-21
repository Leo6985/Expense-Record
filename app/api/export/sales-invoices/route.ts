import { auth } from "@/auth";
import { getSalesInvoices } from "@/actions/sales-invoices";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอรับชำระ",
  PARTIALLY_RECEIVED: "รับชำระบางส่วน",
  RECEIVED: "รับชำระครบแล้ว",
  CANCELLED: "ยกเลิก",
};

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const invoices = await getSalesInvoices();
  const headers = ["วันที่ใบกำกับภาษี", "กำหนดชำระ", "เลขที่ใบกำกับภาษี", "รายชื่อลูกค้า", "ยอดก่อนภาษี", "ส่วนลด", "ภาษีมูลค่าเพิ่ม", "ยอดรวม", "สถานะ"];
  const rows = invoices.map((inv) => ({
    "วันที่ใบกำกับภาษี": inv.invoiceDate.toISOString().slice(0, 10),
    "กำหนดชำระ": inv.dueDate.toISOString().slice(0, 10),
    "เลขที่ใบกำกับภาษี": inv.invoiceNumber,
    "รายชื่อลูกค้า": inv.customer.name,
    "ยอดก่อนภาษี": inv.amount,
    "ส่วนลด": inv.discountAmount,
    "ภาษีมูลค่าเพิ่ม": inv.vatAmount,
    "ยอดรวม": inv.totalAmount,
    "สถานะ": STATUS_LABEL[inv.status] ?? inv.status,
  }));

  // json_to_sheet derives headers from row keys — an empty `rows` array produces a sheet
  // with no header row at all, so the header list must be passed explicitly.
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "SalesInvoices");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `sales_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
