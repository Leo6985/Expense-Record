"use client";

import { useState, useEffect } from "react";
import { getProducts, deleteProduct } from "@/actions/products";
import Link from "next/link";
import ProductCsvImport from "./ProductCsvImport";
import PageLoading from "@/components/PageLoading";

type Product = Awaited<ReturnType<typeof getProducts>>[number];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(q?: string, all = false) {
    setLoading(true);
    const data = await getProducts(q, !all);
    setProducts(data);
    setLoading(false);
  }

  useEffect(() => { load("", showAll); }, [showAll]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบสินค้า "${name}" ใช่หรือไม่?`)) return;
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  const filtered = search
    ? products.filter(
        (p) =>
          p.code.toLowerCase().includes(search.toLowerCase()) ||
          p.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สินค้าและบริการ</h1>
          <p className="text-gray-500 text-sm mt-0.5">ฐานข้อมูลสินค้าสำหรับใช้ในใบสั่งซื้อ</p>
        </div>
        <div className="flex items-center gap-2">
          <ProductCsvImport />
          <Link
            href="/products/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เพิ่มสินค้าใหม่
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาด้วยรหัสหรือชื่อสินค้า..."
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded"
          />
          แสดงที่ปิดใช้งานด้วย
        </label>
      </div>

      {loading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-16 bg-white rounded-xl border border-gray-200">
          ยังไม่มีข้อมูลสินค้า
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">รหัส</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ชื่อสินค้า/บริการ</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">หน่วย</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-600">ผังบัญชี</th>
                <th className="text-center py-2.5 px-4 font-medium text-gray-600">สถานะ</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-gray-800">{p.code}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-gray-800">{p.name}</div>
                    {p.description && <div className="text-xs text-gray-400">{p.description}</div>}
                  </td>
                  <td className="py-2.5 px-4 text-gray-600">{p.unit ?? "-"}</td>
                  <td className="py-2.5 px-4 text-gray-600 text-xs">
                    {p.account ? (
                      <span className="font-mono">{p.account.code}</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                    {p.account && <span className="ml-1 text-gray-500">{p.account.name}</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.isActive ? "ใช้งาน" : "ปิดใช้"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline text-xs mr-3">แก้ไข</Link>
                    <button onClick={() => handleDelete(p.id, p.name)} className="text-red-500 hover:text-red-700 text-xs">ลบ</button>
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
