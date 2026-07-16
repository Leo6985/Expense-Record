import { prisma } from "@/lib/prisma";
import Link from "next/link";

async function getStats() {
  const [poCount, pendingAP, pendingPrep, overdueAP] = await Promise.all([
    prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "APPROVED"] } } }),
    prisma.accountsPayable.count({ where: { status: "PENDING" } }),
    prisma.paymentPrep.count({ where: { status: "APPROVED" } }),
    prisma.accountsPayable.count({
      where: { status: "PENDING", dueDate: { lt: new Date() } },
    }),
  ]);

  const totalPendingAmount = await prisma.accountsPayable.aggregate({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    _sum: { totalAmount: true },
  });

  return { poCount, pendingAP, pendingPrep, overdueAP, totalPendingAmount: totalPendingAmount._sum.totalAmount ?? 0 };
}

async function getRecentPOs() {
  return prisma.purchaseOrder.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { name: true } } },
  });
}

async function getRecentAPs() {
  return prisma.accountsPayable.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { name: true } } },
  });
}

const statusLabel: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "รับแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
  PENDING: { label: "รอดำเนินการ", color: "bg-yellow-100 text-yellow-700" },
  PAYMENT_PREP: { label: "เตรียมจ่าย", color: "bg-purple-100 text-purple-700" },
  PAID: { label: "จ่ายแล้ว", color: "bg-green-100 text-green-700" },
};

export default async function DashboardPage() {
  const [stats, recentPOs, recentAPs] = await Promise.all([
    getStats(),
    getRecentPOs(),
    getRecentAPs(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">หน้าหลัก</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="PO รอดำเนินการ"
          value={stats.poCount}
          icon="📋"
          color="blue"
          href="/purchase-orders"
        />
        <StatCard
          title="หนี้รอตั้ง/อนุมัติ"
          value={stats.pendingAP}
          icon="📄"
          color="yellow"
          href="/accounts-payable"
        />
        <StatCard
          title="รอชำระเงิน"
          value={stats.pendingPrep}
          icon="💳"
          color="purple"
          href="/payment-prep"
        />
        <StatCard
          title="หนี้เกินกำหนด"
          value={stats.overdueAP}
          icon="⚠️"
          color="red"
          href="/accounts-payable"
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 flex items-center gap-4">
        <div className="text-3xl">💰</div>
        <div>
          <div className="text-sm text-blue-600 font-medium">ยอดหนี้คงค้างรวม</div>
          <div className="text-2xl font-bold text-blue-800">
            ฿{new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(stats.totalPendingAmount)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent POs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">ใบสั่งซื้อล่าสุด</h2>
            <Link href="/purchase-orders" className="text-sm text-blue-600 hover:underline">
              ดูทั้งหมด →
            </Link>
          </div>
          {recentPOs.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2">
              {recentPOs.map((po) => {
                const s = statusLabel[po.status] ?? { label: po.status, color: "bg-gray-100 text-gray-700" };
                return (
                  <Link
                    key={po.id}
                    href={`/purchase-orders/${po.id}`}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-1 rounded"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{po.poNumber}</div>
                      <div className="text-xs text-gray-500">{po.vendor.name}</div>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <div className="text-xs text-gray-500 mt-0.5">
                        ฿{new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(po.totalAmount)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent APs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">หนี้สินล่าสุด</h2>
            <Link href="/accounts-payable" className="text-sm text-blue-600 hover:underline">
              ดูทั้งหมด →
            </Link>
          </div>
          {recentAPs.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2">
              {recentAPs.map((ap) => {
                const s = statusLabel[ap.status] ?? { label: ap.status, color: "bg-gray-100 text-gray-700" };
                const isOverdue = ap.status === "PENDING" && new Date(ap.dueDate) < new Date();
                return (
                  <Link
                    key={ap.id}
                    href={`/accounts-payable/${ap.id}`}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-1 rounded"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{ap.apNumber}</div>
                      <div className="text-xs text-gray-500">{ap.vendor.name}</div>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue ? "bg-red-100 text-red-700" : s.color}`}>
                        {isOverdue ? "เกินกำหนด" : s.label}
                      </span>
                      <div className="text-xs text-gray-500 mt-0.5">
                        ฿{new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(ap.totalAmount)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title, value, icon, color, href
}: {
  title: string;
  value: number;
  icon: string;
  color: "blue" | "yellow" | "purple" | "red";
  href: string;
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };

  return (
    <Link href={href} className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-sm transition-shadow ${colors[color]}`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs font-medium opacity-75">{title}</div>
      </div>
    </Link>
  );
}
