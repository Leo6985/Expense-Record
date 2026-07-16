"use client";

export default function PrintBtn() {
  return (
    <button
      onClick={() => window.print()}
      className="ml-auto border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
    >
      🖨️ พิมพ์
    </button>
  );
}
