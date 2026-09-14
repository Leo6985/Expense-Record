"use client";

import { useState } from "react";

export type CashFlowMonth = {
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
};

const POSITIVE = "#2a78d6"; // diverging pair — blue pole (net cash flow >= 0)
const NEGATIVE = "#e34948"; // diverging pair — red pole (net cash flow < 0)
const BASELINE = "#c3c2b7";
const GRIDLINE = "#e1e0d9";

function formatCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}฿${(abs / 1_000).toFixed(1)}K`;
  return `${sign}฿${abs.toFixed(0)}`;
}

function formatFull(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}฿${Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CashFlowChart({ data }: { data: CashFlowMonth[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 16, bottom: 28, left: 16 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const midY = padding.top + plotH / 2;

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.net)));
  const scale = (v: number) => (v / maxAbs) * (plotH / 2 - 20);

  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(24, slot * 0.55);

  const hasAnyFlow = data.some((d) => d.cashIn !== 0 || d.cashOut !== 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: POSITIVE }} />
          กระแสเงินสดสุทธิเป็นบวก
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: NEGATIVE }} />
          กระแสเงินสดสุทธิติดลบ
        </span>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="ml-auto text-blue-600 hover:underline"
        >
          {showTable ? "ซ่อนตาราง" : "ดูข้อมูลตาราง"}
        </button>
      </div>

      {!hasAnyFlow ? (
        <div className="text-center text-gray-400 text-sm py-16">ยังไม่มีข้อมูลรับ/จ่ายเงินในช่วงนี้</div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="กราฟกระแสเงินสดสุทธิรายเดือน">
            <line x1={padding.left} y1={midY - (plotH / 2 - 20)} x2={width - padding.right} y2={midY - (plotH / 2 - 20)} stroke={GRIDLINE} strokeWidth={1} />
            <line x1={padding.left} y1={midY + (plotH / 2 - 20)} x2={width - padding.right} y2={midY + (plotH / 2 - 20)} stroke={GRIDLINE} strokeWidth={1} />
            <line x1={padding.left} y1={midY} x2={width - padding.right} y2={midY} stroke={BASELINE} strokeWidth={1} />

            {data.map((d, i) => {
              const cx = padding.left + slot * i + slot / 2;
              const barH = Math.abs(scale(d.net));
              const isPositive = d.net >= 0;
              const y = isPositive ? midY - barH : midY;
              const color = isPositive ? POSITIVE : NEGATIVE;
              const isHovered = hovered === i;
              const labelY = isPositive ? y - 6 : y + barH + 14;

              return (
                <g
                  key={i}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  tabIndex={0}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  <rect x={cx - slot / 2} y={padding.top} width={slot} height={plotH} fill="transparent" />
                  <rect
                    x={cx - barW / 2}
                    y={y}
                    width={barW}
                    height={Math.max(barH, 1)}
                    rx={4}
                    fill={color}
                    opacity={isHovered ? 1 : 0.9}
                  />
                  <text x={cx} y={labelY} textAnchor="middle" fontSize={11} fill="#52514e">
                    {formatCompact(d.net)}
                  </text>
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="#898781">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {hovered !== null && data[hovered] && (
            <div
              className="absolute bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none"
              style={{
                left: `${((hovered + 0.5) / n) * 100}%`,
                top: 0,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="font-semibold text-gray-800 mb-1">{data[hovered].label}</div>
              <div className="flex justify-between gap-4 text-gray-600">
                <span>รับเข้า</span>
                <span className="font-medium text-gray-900">{formatFull(data[hovered].cashIn)}</span>
              </div>
              <div className="flex justify-between gap-4 text-gray-600">
                <span>จ่ายออก</span>
                <span className="font-medium text-gray-900">{formatFull(data[hovered].cashOut)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-gray-100 mt-1 pt-1">
                <span className="text-gray-600">สุทธิ</span>
                <span className="font-semibold" style={{ color: data[hovered].net >= 0 ? POSITIVE : NEGATIVE }}>
                  {formatFull(data[hovered].net)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {showTable && (
        <div className="mt-3 overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">เดือน</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600">รับเข้า</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600">จ่ายออก</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600">สุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-1.5 text-gray-700">{d.label}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{formatFull(d.cashIn)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{formatFull(d.cashOut)}</td>
                  <td className="px-3 py-1.5 text-right font-medium" style={{ color: d.net >= 0 ? POSITIVE : NEGATIVE }}>
                    {formatFull(d.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
