export async function GET() {
  const csv =
    "code,name,type\r\n" +
    "5100,ค่าใช้จ่ายในการดำเนินงาน,EXPENSE\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="chart_of_account_template.csv"',
    },
  });
}
