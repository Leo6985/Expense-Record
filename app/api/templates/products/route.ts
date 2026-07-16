export async function GET() {
  const csv =
    "code,name,description,unit,accountCode\r\n" +
    "P00001,กระดาษ A4,กระดาษถ่ายเอกสาร A4 80g,รีม,5100\r\n" +
    "P00002,หมึกพิมพ์,หมึกพิมพ์เลเซอร์,กล่อง,5100\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product_template.csv"',
    },
  });
}
