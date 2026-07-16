import { getVendors } from "@/actions/vendors";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import VendorCsvImport from "./VendorCsvImport";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const vendors = await getVendors(q);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ผู้ขาย</h1>
        <div className="flex items-center gap-2">
          <VendorCsvImport />
          <Link
            href="/vendors/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เพิ่มผู้ขาย
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <form>
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาชื่อ, รหัสผู้ขาย, เลขผู้เสียภาษี..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">รหัส</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อผู้ขาย</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ติดต่อ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">อีเมล</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">เครดิต</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    ไม่พบข้อมูลผู้ขาย
                  </td>
                </tr>
              ) : (
                vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-700">
                      <Link href={`/vendors/${vendor.id}`} className="hover:underline">
                        {vendor.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{vendor.name}</td>
                    <td className="px-4 py-3 text-gray-600">{vendor.contactPerson || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{vendor.email || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{vendor.creditDays} วัน</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          vendor.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {vendor.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(vendor.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
