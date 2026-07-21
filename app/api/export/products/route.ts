import { auth } from "@/auth";
import { getProducts } from "@/actions/products";
import * as XLSX from "xlsx";

const HEADERS: [string, string][] = [
  ["code", "รหัส"],
  ["name", "ชื่อสินค้า"],
  ["description", "คำอธิบาย"],
  ["unit", "หน่วย"],
  ["accountCode", "รหัสผังบัญชี"],
  ["isActive", "ใช้งานอยู่"],
];

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const products = await getProducts(undefined, false);
  const rows = products.map((p) => ({
    [HEADERS[0][1]]: p.code,
    [HEADERS[1][1]]: p.name,
    [HEADERS[2][1]]: p.description ?? "",
    [HEADERS[3][1]]: p.unit ?? "",
    [HEADERS[4][1]]: p.account?.code ?? "",
    [HEADERS[5][1]]: String(p.isActive),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS.map(([, label]) => label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Products");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `products_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
