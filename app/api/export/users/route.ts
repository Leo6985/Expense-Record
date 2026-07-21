import { auth } from "@/auth";
import { getUsers } from "@/actions/users";
import * as XLSX from "xlsx";

const HEADERS: [string, string][] = [
  ["name", "ชื่อ"],
  ["email", "อีเมล"],
  ["role", "บทบาท"],
  ["level", "ระดับ"],
  ["isActive", "ใช้งานอยู่"],
];

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Defense in depth on top of proxy.ts's OWNER_ONLY_PATHS gate for /users.
  if ((session.user as { role?: string })?.role !== "OWNER") {
    return new Response("Forbidden", { status: 403 });
  }

  const users = await getUsers();
  const rows = users.map((u) => {
    const row: Record<string, string> = {};
    for (const [key, label] of HEADERS) {
      const value = (u as unknown as Record<string, unknown>)[key];
      row[label] = value === null || value === undefined ? "" : String(value);
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS.map(([, label]) => label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Users");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `users_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
