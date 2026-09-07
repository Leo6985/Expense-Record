import { auth } from "@/auth";
import { getProfitLossStatement } from "@/actions/ledger";
import { getInventorySnapshot } from "@/actions/reports";
import * as XLSX from "xlsx";

const round2 = (n: number) => Math.round(n * 100) / 100;

// คงรูปแบบ periodKey เดิม ("YYYY-MM" / "YYYY") เมื่อช่วงวันที่ตรงกับเดือนเต็ม/ปีเต็ม — ให้ตรงกับหน้าจอ
function inventoryPeriodKey(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fy && ty && fm && tm) {
    const lastDay = new Date(ty, tm, 0).getDate();
    if (fy === ty && fm === tm && fd === 1 && td === lastDay)
      return `${fy}-${String(fm).padStart(2, "0")}`;
    if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `${fy}`;
  }
  return `${from}_${to}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const [stmt, snapshot] = await Promise.all([
    getProfitLossStatement({ from, to }),
    getInventorySnapshot(inventoryPeriodKey(from, to)),
  ]);

  const inventoryChange = round2((snapshot?.closingValue ?? 0) - (snapshot?.openingValue ?? 0));
  const adjustedNet = round2(stmt.netProfit - stmt.payrollTotal + inventoryChange);

  type Row = { ส่วน: string; รหัสบัญชี: string; ชื่อบัญชี: string; จำนวนเงิน: number | string };
  const rows: Row[] = [];
  for (const r of stmt.revenueRows)
    rows.push({ ส่วน: "รายได้", รหัสบัญชี: r.code, ชื่อบัญชี: r.name, จำนวนเงิน: r.amount });
  rows.push({ ส่วน: "", รหัสบัญชี: "", ชื่อบัญชี: "รวมรายได้", จำนวนเงิน: stmt.totalRevenue });
  for (const r of stmt.expenseRows)
    rows.push({ ส่วน: "ค่าใช้จ่าย (บัญชีแยกประเภท)", รหัสบัญชี: r.code, ชื่อบัญชี: r.name, จำนวนเงิน: r.amount });
  rows.push({ ส่วน: "", รหัสบัญชี: "", ชื่อบัญชี: "รวมค่าใช้จ่าย (บัญชีแยกประเภท)", จำนวนเงิน: stmt.totalExpenses });
  rows.push({ ส่วน: "", รหัสบัญชี: "", ชื่อบัญชี: "กำไร(ขาดทุน)จากบัญชีแยกประเภท", จำนวนเงิน: stmt.netProfit });
  for (const r of stmt.payrollRows)
    rows.push({ ส่วน: "ปรับปรุง: เงินเดือน/แรงงาน", รหัสบัญชี: r.code, ชื่อบัญชี: r.name, จำนวนเงิน: -r.amount });
  if (stmt.payrollTotal !== 0)
    rows.push({ ส่วน: "", รหัสบัญชี: "", ชื่อบัญชี: "รวมค่าใช้จ่ายเงินเดือน/แรงงาน", จำนวนเงิน: -stmt.payrollTotal });
  if (inventoryChange !== 0)
    rows.push({
      ส่วน: "ปรับปรุง: สินค้าคงเหลือ",
      รหัสบัญชี: "",
      ชื่อบัญชี: "การเปลี่ยนแปลงสินค้าคงเหลือ (ปลายงวด − ต้นงวด)",
      จำนวนเงิน: inventoryChange,
    });
  rows.push({ ส่วน: "", รหัสบัญชี: "", ชื่อบัญชี: "กำไร(ขาดทุน)สุทธิ", จำนวนเงิน: adjustedNet });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ProfitLoss");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `profit_loss_${from}_${to}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
