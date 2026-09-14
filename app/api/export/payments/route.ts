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
    "ผู้ขาย": Array.from(new Set(p.prep.items.map((item) => item.ap.vendor.name))).join(", "),
    "วันที่ชำระ": p.paymentDate.toISOString().slice(0, 10),
    "วิธีชำระ": p.paymentMethod,
    "ธนาคาร": p.companyBankAccount.bankName,
    "จำนวนเงิน": p.amount,
    "เลขที่อ้างอิง": p.referenceNumber ?? "",
    "หมายเหตุ": p.notes ?? "",
  }));

  const detailRows = payments.flatMap((p) =>
    p.prep.items.map((item) => ({
      "เลขที่การชำระเงิน": p.paymentNumber,
      "วันที่ชำระ": p.paymentDate.toISOString().slice(0, 10),
      "ผู้ขาย": item.ap.vendor.name,
      "เลข AP": item.ap.apNumber,
      "เลขที่ใบแจ้งหนี้": item.ap.invoiceNumber,
      "จำนวนเงิน": item.amount,
      "หัก ณ ที่จ่าย (%)": item.withholdingTaxRate,
      "หัก ณ ที่จ่าย (บาท)": item.withholdingTaxAmount,
      "สุทธิ": item.netAmount,
    }))
  );

  const sheet = XLSX.utils.json_to_sheet(rows);
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Payments");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "รายละเอียดรายการ");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `payments_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
