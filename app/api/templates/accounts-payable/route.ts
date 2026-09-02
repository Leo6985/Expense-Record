export async function GET() {
  const csv =
    "วันที่ใบแจ้งหนี้,เลขที่ใบแจ้งหนี้,ชื่อผู้ขาย,ยอดก่อนภาษี,ภาษีมูลค่าเพิ่ม,ยอดรวม,รหัสผังบัญชี,หมายเหตุ\r\n" +
    "2026-08-01,PINV-000001,บริษัท ตัวอย่าง จำกัด,1000,70,1070,1140-20,\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="accounts_payable_template.csv"',
    },
  });
}
