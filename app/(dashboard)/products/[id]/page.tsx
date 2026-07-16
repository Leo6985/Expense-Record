"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProduct, updateProduct } from "@/actions/products";
import { getChartOfAccounts } from "@/actions/chart-of-accounts";
import Link from "next/link";

type Product = Awaited<ReturnType<typeof getProduct>>;
type Account = Awaited<ReturnType<typeof getChartOfAccounts>>[number];

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getProduct(params.id as string).then(setProduct);
    getChartOfAccounts().then((data) => setAccounts(data.filter((a) => a.isActive)));
  }, [params.id]);

  if (!product) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await updateProduct(product!.id, {
        code: form.get("code") as string,
        name: form.get("name") as string,
        description: (form.get("description") as string) || undefined,
        unit: (form.get("unit") as string) || undefined,
        accountId: (form.get("accountId") as string) || undefined,
        isActive: form.get("isActive") === "true",
      });
      router.push("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/products" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขสินค้า</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสินค้า *</label>
            <input
              name="code"
              required
              defaultValue={product.code}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
            <input
              name="unit"
              defaultValue={product.unit ?? ""}
              placeholder="เช่น ชิ้น, กก., กล่อง"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า/บริการ *</label>
          <input
            name="name"
            required
            defaultValue={product.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={product.description ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผังบัญชี</label>
            <select
              name="accountId"
              defaultValue={product.accountId ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- ไม่ระบุ --</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
            <select
              name="isActive"
              defaultValue={product.isActive ? "true" : "false"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">ใช้งาน</option>
              <option value="false">ปิดใช้</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <Link href="/products" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
