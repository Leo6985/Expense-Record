import { getUsers } from "@/actions/users";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

const roleLabel: Record<string, string> = {
  OWNER: "เจ้าของ",
  PURCHASING: "จัดซื้อ",
  ACCOUNTING: "บัญชีและการเงิน",
};

const roleColor: Record<string, string> = {
  OWNER: "bg-yellow-100 text-yellow-800",
  PURCHASING: "bg-blue-100 text-blue-800",
  ACCOUNTING: "bg-green-100 text-green-800",
};

const levelLabel: Record<string, string> = {
  MANAGER: "ผู้จัดการ",
  EMPLOYEE: "พนักงาน",
};

const levelColor: Record<string, string> = {
  MANAGER: "bg-purple-100 text-purple-800",
  EMPLOYEE: "bg-gray-100 text-gray-700",
};

export default async function UsersPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "OWNER") redirect("/unauthorized");

  const users = await getUsers();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
        <div className="flex items-center gap-3">
          <a
            href="/api/export/users"
            className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium"
          >
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link
            href="/users/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เพิ่มผู้ใช้งาน
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">อีเมล</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">แผนก/สิทธิ์</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ระดับ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">สร้างเมื่อ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleColor[user.role] ?? "bg-gray-100 text-gray-700"}`}>
                    {roleLabel[user.role] ?? user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${levelColor[user.level] ?? "bg-gray-100 text-gray-700"}`}>
                    {levelLabel[user.level] ?? user.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {user.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/users/${user.id}`} className="text-blue-600 hover:underline text-xs">
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
