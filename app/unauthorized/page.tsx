import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-gray-500 mb-6">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        <Link
          href="/"
          className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 transition-colors"
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
