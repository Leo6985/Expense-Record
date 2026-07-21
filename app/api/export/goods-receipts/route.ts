import { auth } from "@/auth";
import { getGoodsReceipts } from "@/actions/goods-receipts";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const grs = await getGoodsReceipts();
  const rows = grs.map((gr) => ({
    "เลขที่ GR": gr.grNumber,
    "เลขที่ PO": gr.po.poNumber,
    "ผู้ขาย": gr.po.vendor.name,
    "วันที่รับสินค้า": gr.receivedDate.toISOString().slice(0, 10),
    "ผู้รับ": gr.receivedBy ?? "",
    "เลขที่ AP ที่สร้าง": gr.accountsPayable.map((ap) => ap.apNumber).join(", "),
    "หมายเหตุ": gr.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "GoodsReceipts");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `goods_receipts_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
