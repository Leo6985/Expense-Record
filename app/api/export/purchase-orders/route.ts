import { auth } from "@/auth";
import { getPurchaseOrders } from "@/actions/purchase-orders";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const pos = await getPurchaseOrders();
  const rows = pos.map((po) => ({
    "เลขที่ PO": po.poNumber,
    "เลขที่ PR": po.prNumber ?? "",
    "ผู้ขาย": po.vendor.name,
    "วันที่สั่งซื้อ": po.orderDate.toISOString().slice(0, 10),
    "สถานะ": po.status,
    "มูลค่ารวม": po.totalAmount,
    "VAT": po.vatAmount,
    "หมายเหตุ": po.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "PurchaseOrders");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `purchase_orders_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
