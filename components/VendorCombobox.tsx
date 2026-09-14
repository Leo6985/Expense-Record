"use client";

import { useState, useEffect, useRef } from "react";

export type ComboboxVendor = { id: string; code: string; name: string };

export default function VendorCombobox({
  vendors,
  vendorId,
  onSelect,
  placeholder = "พิมพ์เพื่อค้นหาชื่อผู้ขาย...",
  className = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
}: {
  vendors: ComboboxVendor[];
  vendorId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = vendors.find((v) => v.id === vendorId);

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
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(query.toLowerCase()) ||
          v.code.toLowerCase().includes(query.toLowerCase())
      )
    : vendors;

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={open ? query : selected ? `${selected.code} - ${selected.name}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (vendorId) onSelect("");
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">ไม่พบผู้ขาย</div>
          ) : (
            filtered.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  onSelect(v.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                <span className="font-mono text-blue-700">{v.code}</span> - {v.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
