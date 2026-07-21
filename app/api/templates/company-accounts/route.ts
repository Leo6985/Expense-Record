export async function GET() {
  const csv =
    "bankName,branch,accountNo,accountName\r\n" +
    "ธนาคารกสิกรไทย,สาขาสีลม,123-4-56789-0,บริษัท ตัวอย่าง จำกัด\r\n";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="company_bank_account_template.csv"',
    },
  });
}
