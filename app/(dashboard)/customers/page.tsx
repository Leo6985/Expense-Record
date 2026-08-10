import { getCustomers } from "@/actions/customers";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import CustomerCsvImport from "./CustomerCsvImport";
import DeleteCustomerButton from "./DeleteCustomerButton";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await getCustomers(q);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ลูกค้า</h1>
        <div className="flex items-center gap-2">
          <CustomerCsvImport />
          <Link
            href="/customers/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เพิ่มลูกค้า
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาชื่อ, รหัสลูกค้า, เลขประจำตัวผู้เสียภาษี..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
            >
              ค้นหา
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">รหัส</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อลูกค้า</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้ติดต่อ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">อีเมล</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สร้างเมื่อ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    ไม่พบข้อมูลลูกค้า
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-700">
                      <Link href={`/customers/${customer.id}`} className="hover:underline">
                        {customer.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{customer.name}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.contactPerson || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.email || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          customer.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {customer.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(customer.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteCustomerButton customerId={customer.id} customerName={customer.name} />
                    </td>
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
