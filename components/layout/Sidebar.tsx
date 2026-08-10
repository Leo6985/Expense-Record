"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

type MenuItem = { href: string; label: string; icon: string };
type MenuGroup = { label: string; items: MenuItem[]; roles: string[] };

const menuGroups: MenuGroup[] = [
  {
    label: "แผนกจัดซื้อ",
    roles: ["PURCHASING", "ACCOUNTING", "OWNER"],
    items: [
      { href: "/purchase-orders", label: "ใบสั่งซื้อ (PO)", icon: "📋" },
      { href: "/goods-receipts", label: "รับสินค้า (GR)", icon: "📦" },
    ],
  },
  {
    label: "บัญชีและการเงิน",
    roles: ["ACCOUNTING", "OWNER"],
    items: [
      { href: "/accounts-payable", label: "ตั้งหนี้ (AP)", icon: "📄" },
      { href: "/payment-prep", label: "ใบเตรียมจ่าย", icon: "📑" },
      { href: "/payments", label: "บันทึกชำระเงิน", icon: "💳" },
    ],
  },
  {
    label: "ขายและลูกหนี้",
    roles: ["ACCOUNTING", "OWNER"],
    items: [
      { href: "/sales-invoices", label: "ใบกำกับภาษีขาย", icon: "🧾" },
      { href: "/receipts", label: "รับชำระเงิน", icon: "💰" },
      { href: "/debit-credit-notes", label: "ใบเพิ่ม/ลดหนี้", icon: "📝" },
    ],
  },
  {
    label: "ข้อมูลหลัก",
    roles: ["PURCHASING", "ACCOUNTING", "OWNER"],
    items: [
      { href: "/vendors", label: "ผู้ขาย", icon: "🏢" },
      { href: "/customers", label: "ลูกค้า", icon: "🧑‍💼" },
      { href: "/products", label: "สินค้าและบริการ", icon: "📦" },
      { href: "/chart-of-accounts", label: "ผังบัญชี", icon: "📊" },
      { href: "/company-accounts", label: "บัญชีบริษัท", icon: "🏦" },
    ],
  },
  {
    label: "รายงาน",
    roles: ["ACCOUNTING", "OWNER"],
    items: [
      { href: "/reports/daily-payments", label: "ชำระเงินรายวัน", icon: "💳" },
      { href: "/reports/outstanding-ap", label: "เจ้าหนี้ค้างชำระ", icon: "📋" },
      { href: "/reports/overdue-ap", label: "เจ้าหนี้เกินกำหนด", icon: "⚠️" },
      { href: "/reports/bank-statement", label: "รายงานการเดินบัญชีธนาคาร", icon: "🏦" },
      { href: "/reports/monthly-purchase", label: "การซื้อประจำเดือน", icon: "🛒" },
      { href: "/reports/monthly-wht", label: "ภาษีหัก ณ ที่จ่าย", icon: "🧾" },
    ],
  },
  {
    label: "จัดการระบบ",
    roles: ["OWNER"],
    items: [
      { href: "/users", label: "จัดการผู้ใช้งาน", icon: "👥" },
    ],
  },
];

const roleLabel: Record<string, string> = {
  OWNER: "เจ้าของ",
  PURCHASING: "จัดซื้อ",
  ACCOUNTING: "บัญชีและการเงิน",
};

const roleColor: Record<string, string> = {
  OWNER: "bg-yellow-500",
  PURCHASING: "bg-blue-400",
  ACCOUNTING: "bg-green-400",
};

export default function Sidebar({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();

  const visibleGroups = menuGroups.filter((g) => g.roles.includes(role));

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-blue-900 text-white flex flex-col z-10">
      <div className="px-4 py-5 border-b border-blue-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center text-sm">💼</div>
          <div>
            <div className="font-bold text-sm leading-tight">ระบบบันทึกค่าใช้จ่าย</div>
            <div className="text-blue-300 text-xs">Expense Record</div>
          </div>
        </Link>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-blue-800 bg-blue-950">
        <div className="text-sm font-medium text-white truncate">{userName}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-2 h-2 rounded-full ${roleColor[role] ?? "bg-gray-400"}`}></span>
          <span className="text-xs text-blue-300">{roleLabel[role] ?? role}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4 transition-colors",
            pathname === "/"
              ? "bg-blue-700 text-white"
              : "text-blue-200 hover:bg-blue-800 hover:text-white"
          )}
        >
          <span>🏠</span>
          <span>หน้าหลัก</span>
        </Link>

        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="text-blue-400 text-xs font-semibold uppercase tracking-wider px-3 mb-1">
              {group.label}
            </div>
            {group.items.map((item) => {
              // Hide from PURCHASING
              if (item.href === "/company-accounts" && role === "PURCHASING") return null;
              if (item.href === "/chart-of-accounts" && role === "PURCHASING") return null;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                    isActive
                      ? "bg-blue-700 text-white"
                      : "text-blue-200 hover:bg-blue-800 hover:text-white"
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-blue-800">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-200 hover:bg-blue-800 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
