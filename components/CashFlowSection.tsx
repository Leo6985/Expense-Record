"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getMonthlyCashFlowByYear } from "@/actions/dashboard";
import CashFlowChart, { CashFlowMonth } from "@/components/CashFlowChart";

export default function CashFlowSection({
  initialYear,
  initialData,
  yearOptions,
}: {
  initialYear: number;
  initialData: CashFlowMonth[];
  yearOptions: number[];
}) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newYear = Number(e.target.value);
    setYear(newYear);
    startTransition(async () => {
      setData(await getMonthlyCashFlowByYear(newYear));
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">กระแสเงินสดรายปี</h2>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={handleYearChange}
            disabled={isPending}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                ปี {y + 543}
              </option>
            ))}
          </select>
          <Link href="/cash-flow" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            งบกระแสเงินสดฉบับเต็ม →
          </Link>
        </div>
      </div>
      <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <CashFlowChart data={data} />
      </div>
    </div>
  );
}
