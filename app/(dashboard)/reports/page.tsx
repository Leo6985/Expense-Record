import Link from "next/link";

const reports = [
  {
    href: "/reports/daily-payments",
    icon: "💳",
    title: "รายการการชำระเงินรายวัน",
    desc: "ดูรายการชำระเงินตามช่วงวันที่ที่เลือก",
    color: "border-blue-200 bg-blue-50 hover:bg-blue-100",
    iconBg: "bg-blue-100",
  },
  {
    href: "/reports/outstanding-ap",
    icon: "📋",
    title: "รายงานเจ้าหนี้ค้างชำระ",
    desc: "รายการหนี้ที่ยังไม่ได้ชำระทั้งหมด",
    color: "border-amber-200 bg-amber-50 hover:bg-amber-100",
    iconBg: "bg-amber-100",
  },
  {
    href: "/reports/overdue-ap",
    icon: "⚠️",
    title: "รายงานเจ้าหนี้เกินกำหนดชำระ",
    desc: "รายการหนี้ที่เกินกำหนดชำระแล้วและยังไม่ได้จ่าย",
    color: "border-red-200 bg-red-50 hover:bg-red-100",
    iconBg: "bg-red-100",
  },
  {
    href: "/reports/bank-statement",
    icon: "🏦",
    title: "รายงานการเดินบัญชีธนาคาร",
    desc: "รายการเคลื่อนไหวของบัญชีธนาคารบริษัทตามช่วงวันที่",
    color: "border-green-200 bg-green-50 hover:bg-green-100",
    iconBg: "bg-green-100",
  },
  {
    href: "/reports/monthly-purchase",
    icon: "🛒",
    title: "รายงานการซื้อประจำเดือน",
    desc: "สรุปยอดซื้อและการตั้งหนี้รายเดือนแยกตามผู้ขาย",
    color: "border-indigo-200 bg-indigo-50 hover:bg-indigo-100",
    iconBg: "bg-indigo-100",
  },
];

export default function ReportsPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รายงาน</h1>
        <p className="text-gray-500 text-sm mt-1">เลือกรายงานที่ต้องการดู</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className={`block rounded-xl border p-5 transition-colors ${r.color}`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-3 ${r.iconBg}`}>
              {r.icon}
            </div>
            <div className="font-semibold text-gray-900 mb-1">{r.title}</div>
            <div className="text-sm text-gray-500">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
