export async function GET() {
  const csv =
    "code,name,taxId,address,contactPerson,phone,email,creditDays\r\n" +
    "C00001,บริษัท ตัวอย่าง จำกัด,1234567890123,123 ถ.สุขุมวิท กรุงเทพ,สมชาย ใจดี,0812345678,contact@example.com,30\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customer_template.csv"',
    },
  });
}
