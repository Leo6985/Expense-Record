import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "อนุมัติแล้ว",
};

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const vouchers = await prisma.journalVoucher.findMany({
    include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { lineNo: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  // One row per line, with the voucher header repeated — matches how a general journal reads.
  const rows = vouchers.flatMap((v) =>
    v.lines.map((l) => ({
      "เลขที่ใบสำคัญ": v.voucherNumber,
      "วันที่": v.voucherDate.toISOString().slice(0, 10),
      "รายละเอียด (หัวเอกสาร)": v.description,
      "สถานะ": STATUS_LABEL[v.status] ?? v.status,
      "เลขที่บัญชี": l.account.code,
      "ชื่อบัญชี": l.account.name,
      "แผนก": l.department ?? "",
      "รายละเอียด (บรรทัด)": l.description ?? "",
      "เดบิต": l.debit || "",
      "เครดิต": l.credit || "",
    }))
  );

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "JournalVouchers");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `journal_vouchers_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
