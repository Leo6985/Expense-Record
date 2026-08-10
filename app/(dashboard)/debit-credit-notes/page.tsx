import { getDebitCreditNotes } from "@/actions/debit-credit-notes";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

const typeConfig: Record<string, { label: string; color: string }> = {
  DEBIT: { label: "เพิ่มหนี้", color: "bg-orange-100 text-orange-700" },
  CREDIT: { label: "ลดหนี้", color: "bg-teal-100 text-teal-700" },
};

export default async function DebitCreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const { q, type, status } = await searchParams;
  const notes = await getDebitCreditNotes(q, type, status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ใบเพิ่มหนี้ / ใบลดหนี้</h1>
        <div className="flex items-center gap-3">
          <a href="/api/export/debit-credit-notes" className="text-sm text-green-700 hover:underline flex items-center gap-1 font-medium">
            ⬇ ดาวน์โหลด (.xlsx)
          </a>
          <Link
            href="/debit-credit-notes/new?type=DEBIT"
            className="border border-orange-300 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
          >
            + ใบเพิ่มหนี้
          </Link>
          <Link
            href="/debit-credit-notes/new?type=CREDIT"
            className="bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors"
          >
            + ใบลดหนี้
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <form className="flex-1 flex gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหาเลขที่เอกสาร, เลขที่ใบกำกับภาษี, ชื่อลูกค้า..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              name="type"
              defaultValue={type ?? ""}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกประเภท</option>
              {Object.entries(typeConfig).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกสถานะ</option>
              {Object.entries(statusConfig).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <button type="submit" className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
              ค้นหา
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">เลขที่</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ประเภท</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ใบกำกับภาษีอ้างอิง</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">จำนวนเงิน</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                notes.map((n) => {
                  const s = statusConfig[n.status] ?? { label: n.status, color: "bg-gray-100 text-gray-700" };
                  const t = typeConfig[n.type] ?? { label: n.type, color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={n.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/debit-credit-notes/${n.id}`} className="font-mono text-blue-700 hover:underline">
                          {n.noteNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(n.noteDate)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/sales-invoices/${n.invoiceId}`} className="text-blue-700 hover:underline">
                          {n.invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{n.invoice.customer.name}</td>
                      <td className="px-4 py-3 text-right font-medium">฿{formatCurrency(n.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
