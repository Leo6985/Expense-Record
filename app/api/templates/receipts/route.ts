export async function GET() {
  const csv =
    "วันที่รับชำระ,วันที่บันทึก,เลขที่ใบกำกับภาษีขาย,เลขบัญชีธนาคาร,วิธีการชำระ,เลขที่อ้างอิง,จำนวนเงิน,ค่าธรรมเนียม,ภาษีหัก ณ ที่จ่าย,เลขที่หนังสือรับรองหัก ณ ที่จ่าย,ยอดรับจริง,หมายเหตุ\r\n" +
    "2026-08-01,,SINV-000001,1234567890,โอนเงิน,,1000,0,0,,1000,\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="receipts_template.csv"',
    },
  });
}
