export default function PageLoading({ label = "กำลังโหลด...", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-gray-400 ${compact ? "py-3" : "py-16"}`}>
      <div className={`border-gray-200 border-t-blue-600 rounded-full animate-spin ${compact ? "w-5 h-5 border-2" : "w-8 h-8 border-4"}`} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
