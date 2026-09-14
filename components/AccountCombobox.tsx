"use client";

import { useState, useEffect, useRef } from "react";

export type ComboboxAccount = { id: string; code: string; name: string };

export default function AccountCombobox({
  accounts,
  accountId,
  onSelect,
  allLabel,
  placeholder = "พิมพ์เพื่อค้นหาผังบัญชี...",
}: {
  accounts: ComboboxAccount[];
  accountId: string;
  onSelect: (id: string) => void;
  /** ถ้าระบุ จะมีตัวเลือกพิเศษ (value "ALL") ปักหมุดอยู่บนสุดของรายการเสมอ */
  allLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = accountId === "ALL" ? null : accounts.find((a) => a.id === accountId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.code.toLowerCase().includes(query.toLowerCase())
      )
    : accounts;

  const displayValue = open
    ? query
    : accountId === "ALL" && allLabel
    ? allLabel
    : selected
    ? `${selected.code} — ${selected.name}`
    : "";

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {allLabel && (
            <button
              type="button"
              onClick={() => {
                onSelect("ALL");
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 border-b border-gray-100"
            >
              {allLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">ไม่พบผังบัญชี</div>
          ) : (
            filtered.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  onSelect(a.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                <span className="font-mono text-blue-700">{a.code}</span> — {a.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
