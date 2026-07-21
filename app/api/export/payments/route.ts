import { auth } from "@/auth";
import { getPayments } from "@/actions/payments";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const payments = await getPayments();
  const rows = payments.map((p) => ({
    "เลขที่การชำระเงิน": p.paymentNumber,
    "เลขที่ใบเตรียมจ่าย": p.prep.prepNumber,
    "วันที่ชำระ": p.paymentDate.toISOString().slice(0, 10),
    "วิธีชำระ": p.paymentMethod,
    "ธนาคาร": p.companyBankAccount.bankName,
    "จำนวนเงิน": p.amount,
    "เลขที่อ้างอิง": p.referenceNumber ?? "",
    "หมายเหตุ": p.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Payments");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `payments_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
