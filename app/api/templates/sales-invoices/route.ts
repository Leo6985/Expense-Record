export async function GET() {
  const csv =
    "วันที่ใบกำกับภาษี,เลขที่ใบกำกับภาษี,รายชื่อลูกค้า,ยอดก่อนภาษี,ส่วนลด,ภาษีมูลค่าเพิ่ม,ยอดรวม\r\n" +
    "2026-08-01,INV-000001,บริษัท ตัวอย่าง จำกัด,1000,0,70,1070\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sales_invoice_template.csv"',
    },
  });
}
