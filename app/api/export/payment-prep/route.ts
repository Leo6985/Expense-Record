import { auth } from "@/auth";
import { getPaymentPreps } from "@/actions/payment-prep";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const preps = await getPaymentPreps();
  const rows = preps.map((prep) => ({
    "เลขที่ใบเตรียมจ่าย": prep.prepNumber,
    "วันที่จ่าย": prep.paymentDate.toISOString().slice(0, 10),
    "จำนวนรายการ": prep.items.length,
    "มูลค่ารวม": prep.totalAmount,
    "หัก ณ ที่จ่าย": prep.totalWithholdingTax,
    "ยอดสุทธิ": prep.netPayableAmount,
    "สถานะ": prep.status,
    "หมายเหตุ": prep.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "PaymentPreps");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `payment_preps_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
