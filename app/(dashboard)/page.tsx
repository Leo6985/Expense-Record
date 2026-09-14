import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getAvailableInvoicesForReceipt } from "@/actions/sales-invoices";
import { getMonthlyCashFlowByYear, getCashFlowYearOptions } from "@/actions/dashboard";
import { formatCurrency } from "@/lib/utils";
import CashFlowSection from "@/components/CashFlowSection";

function monthStart(monthsAgo: number, now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
}

async function getFinancialSummary() {
  const now = new Date();
  const thisMonthStart = monthStart(0, now);
  const nextMonthStart = monthStart(-1, now);
  const lastMonthStart = monthStart(1, now);

  const [salesThisMonth, salesLastMonth, apOutstanding, arInvoices] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: thisMonthStart, lt: nextMonthStart } },
      _sum: { totalAmount: true },
    }),
    prisma.salesInvoice.aggregate({
      where: { status: { not: "CANCELLED" }, invoiceDate: { gte: lastMonthStart, lt: thisMonthStart } },
      _sum: { totalAmount: true },
    }),
    prisma.accountsPayable.aggregate({
      where: { status: { notIn: ["CANCELLED", "PAID"] } },
      _sum: { totalAmount: true },
    }),
    getAvailableInvoicesForReceipt(),
  ]);

  const arOutstanding = Math.round(arInvoices.reduce((s, inv) => s + inv.remainingAmount, 0) * 100) / 100;

  return {
    salesThisMonth: salesThisMonth._sum.totalAmount ?? 0,
    salesLastMonth: salesLastMonth._sum.totalAmount ?? 0,
    apOutstanding: apOutstanding._sum.totalAmount ?? 0,
    arOutstanding,
  };
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

function FinancialTile({
  title, value, href, deltaVsLastMonth,
}: {
  title: string;
  value: number;
  href: string;
  deltaVsLastMonth?: number;
}) {
  let delta: { pct: number; up: boolean } | null = null;
  if (deltaVsLastMonth !== undefined) {
    if (deltaVsLastMonth === 0 && value === 0) {
      delta = null;
    } else if (deltaVsLastMonth === 0) {
      delta = { pct: 100, up: true };
    } else {
      delta = { pct: Math.round(((value - deltaVsLastMonth) / Math.abs(deltaVsLastMonth)) * 1000) / 10, up: value >= deltaVsLastMonth };
    }
  }

  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow block">
      <div className="text-sm text-gray-500 font-medium mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-900">฿{formatCurrency(value)}</div>
      {delta && (
        <div className={`text-xs mt-1 font-medium ${delta.up ? "text-green-700" : "text-red-600"}`}>
          {delta.up ? "▲" : "▼"} {Math.abs(delta.pct)}% เทียบเดือนก่อน
        </div>
      )}
    </Link>
  );
}

export default async function DashboardPage() {
  const currentYear = new Date().getUTCFullYear();
  const [financials, cashFlowYearOptions, cashFlow, recentPOs, recentAPs] = await Promise.all([
    getFinancialSummary(),
    getCashFlowYearOptions(),
    getMonthlyCashFlowByYear(currentYear),
    getRecentPOs(),
    getRecentAPs(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">หน้าหลัก</h1>

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <FinancialTile
          title="ยอดขายเดือนนี้"
          value={financials.salesThisMonth}
          deltaVsLastMonth={financials.salesLastMonth}
          href="/sales-invoices"
        />
        <FinancialTile
          title="เจ้าหนี้การค้า (คงค้าง)"
          value={financials.apOutstanding}
          href="/accounts-payable"
        />
        <FinancialTile
          title="ลูกหนี้การค้า (คงค้าง)"
          value={financials.arOutstanding}
          href="/sales-invoices"
        />
      </div>

      {/* Cash flow chart */}
      <CashFlowSection initialYear={currentYear} initialData={cashFlow} yearOptions={cashFlowYearOptions} />

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
                        ฿{formatCurrency(po.totalAmount)}
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
                        ฿{formatCurrency(ap.totalAmount)}
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
