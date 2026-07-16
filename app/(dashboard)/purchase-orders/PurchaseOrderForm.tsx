"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getVendors } from "@/actions/vendors";
import { getProducts } from "@/actions/products";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

type Vendor = { id: string; code: string; name: string };
type Product = Awaited<ReturnType<typeof getProducts>>[number];
type Item = {
  productId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export type PurchaseOrderFormValues = {
  vendorId: string;
  prNumber?: string;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  vatRate: number;
  items: {
    productId?: string;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
  }[];
};

export type PurchaseOrderFormInitial = {
  vendorId: string;
  prNumber: string;
  orderDate: string;
  expectedDate: string;
  notes: string;
  vatRate: string;
  items: Item[];
};

function VendorCombobox({
  vendors,
  vendorId,
  onSelect,
}: {
  vendors: Vendor[];
  vendorId: string;
  onSelect: (id: string) => void;
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
        placeholder="พิมพ์เพื่อค้นหาชื่อผู้ขาย..."
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

function ProductCombobox({
  products,
  productId,
  fallbackLabel,
  onSelect,
}: {
  products: Product[];
  productId: string;
  fallbackLabel?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === productId);

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
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.code.toLowerCase().includes(query.toLowerCase())
      )
    : products;

  const displayValue = selected
    ? `${selected.code} — ${selected.name}`
    : productId && fallbackLabel
    ? `${fallbackLabel} (ไม่พร้อมใช้งาน)`
    : "";

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={open ? query : displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          if (productId) onSelect("");
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder="พิมพ์เพื่อค้นหาสินค้า..."
        autoComplete="off"
        required
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">ไม่พบสินค้า</div>
          ) : (
            filtered.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                <span className="font-mono text-blue-700">{p.code}</span> — {p.name}
                {p.unit ? ` (${p.unit})` : ""}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const emptyItem: Item = { productId: "", description: "", quantity: "1", unit: "", unitPrice: "0" };

export default function PurchaseOrderForm({
  title,
  backHref,
  submitLabel,
  savingLabel,
  initialValues,
  creatorLabel,
  creatorName,
  onSubmit,
}: {
  title: string;
  backHref: string;
  submitLabel: string;
  savingLabel: string;
  initialValues?: PurchaseOrderFormInitial;
  creatorLabel?: string;
  creatorName?: string;
  onSubmit: (values: PurchaseOrderFormValues) => Promise<void>;
}) {
  const { data: session } = useSession();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorId, setVendorId] = useState(initialValues?.vendorId ?? "");
  const [vatRate, setVatRate] = useState(initialValues?.vatRate ?? "7");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>(initialValues?.items ?? [emptyItem]);

  const displayName = creatorName ?? session?.user?.name ?? "";
  const displayLabel = creatorLabel ?? "ผู้จัดทำ";

  useEffect(() => {
    getVendors().then(setVendors);
    getProducts(undefined, true).then(setProducts);
  }, []);

  const subtotalAmount = items.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
    0
  );
  const vatAmount = subtotalAmount * ((parseFloat(vatRate) || 0) / 100);
  const totalAmount = subtotalAmount + vatAmount;

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof Item, value: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId,
      description: product ? product.name : newItems[index].description,
      unit: product?.unit ?? newItems[index].unit,
    };
    setItems(newItems);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);

    try {
      if (!vendorId) {
        setError("กรุณาเลือกผู้ขาย");
        setLoading(false);
        return;
      }
      const hasUnselected = items.some((item) => !item.productId);
      if (hasUnselected) {
        setError("กรุณาเลือกสินค้าให้ครบทุกรายการ");
        setLoading(false);
        return;
      }
      await onSubmit({
        vendorId,
        prNumber: (form.get("prNumber") as string) || undefined,
        orderDate: form.get("orderDate") as string,
        expectedDate: (form.get("expectedDate") as string) || undefined,
        notes: (form.get("notes") as string) || undefined,
        vatRate: parseFloat(vatRate) || 0,
        items: items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          return {
            productId: item.productId,
            description: product?.name ?? item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || product?.unit || undefined,
            unitPrice: parseFloat(item.unitPrice) || 0,
          };
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลหลัก</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm">
              <span className="text-blue-400">👤</span>
              <span className="text-gray-500">{displayLabel}:</span>
              <span className="font-medium text-gray-900">{displayName || "กำลังโหลด..."}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ใบขอซื้อ (PR)</label>
              <input
                name="prNumber"
                defaultValue={initialValues?.prNumber}
                placeholder="เช่น PR256801001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ขาย *</label>
              <VendorCombobox vendors={vendors} vendorId={vendorId} onSelect={setVendorId} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่สั่งซื้อ *</label>
              <input
                name="orderDate"
                type="date"
                required
                defaultValue={initialValues?.orderDate ?? today}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่คาดว่าจะได้รับ</label>
              <input
                name="expectedDate"
                type="date"
                defaultValue={initialValues?.expectedDate}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={initialValues?.notes}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">รายการสินค้า/บริการ</h2>
            <button type="button" onClick={addItem} className="text-blue-700 text-sm hover:underline">
              + เพิ่มรายการ
            </button>
          </div>

          {products.length === 0 && (
            <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
              ยังไม่มีสินค้าในระบบ — กรุณาเพิ่มสินค้าก่อนที่{" "}
              <a href="/products/new" target="_blank" className="underline font-medium">หน้าสินค้า</a>
            </div>
          )}

          <div className="space-y-3">
            {items.map((item, index) => {
              const selectedProduct = products.find((p) => p.id === item.productId);
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
              return (
                <div key={index} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">สินค้า *</label>
                      <ProductCombobox
                        products={products}
                        productId={item.productId}
                        fallbackLabel={item.description}
                        onSelect={(id) => selectProduct(index, id)}
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="mt-5 text-red-400 hover:text-red-600 text-xl leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {selectedProduct?.account && (
                    <div className="mb-2 text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-1">
                      ผังบัญชี: {selectedProduct.account.code} — {selectedProduct.account.name}
                    </div>
                  )}

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">จำนวน</label>
                      <input
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">หน่วย</label>
                      <input
                        value={item.unit}
                        onChange={(e) => updateItem(index, "unit", e.target.value)}
                        placeholder="ชิ้น"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">ราคาต่อหน่วย</label>
                      <input
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">รวม</label>
                      <div className="py-1.5 text-sm text-right font-semibold text-gray-800">
                        {new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">VAT</label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">0% (ไม่มี VAT)</option>
                <option value="7">7% (มาตรฐาน)</option>
              </select>
            </div>
            <div className="text-right space-y-1">
              <div className="text-sm text-gray-500">
                ยอดก่อน VAT <span className="text-gray-700 font-medium">฿{formatCurrency(subtotalAmount)}</span>
              </div>
              <div className="text-sm text-gray-500">
                VAT {vatRate}% <span className="text-gray-700 font-medium">฿{formatCurrency(vatAmount)}</span>
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-700 mr-4">ยอดรวมทั้งสิ้น</span>
                <span className="text-lg font-bold text-blue-700">฿{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? savingLabel : submitLabel}
          </button>
          <Link href={backHref} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
