import Link from "next/link";

export default function DocNav({
  basePath,
  prevId,
  nextId,
  className = "",
}: {
  basePath: string;
  prevId: string | null | undefined;
  nextId: string | null | undefined;
  className?: string;
}) {
  const btn =
    "inline-flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors";
  const disabledBtn =
    "inline-flex items-center gap-1 border border-gray-200 text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium cursor-not-allowed";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {prevId ? (
        <Link href={`${basePath}/${prevId}`} className={btn}>
          ← ก่อนหน้า
        </Link>
      ) : (
        <span className={disabledBtn}>← ก่อนหน้า</span>
      )}
      {nextId ? (
        <Link href={`${basePath}/${nextId}`} className={btn}>
          ถัดไป →
        </Link>
      ) : (
        <span className={disabledBtn}>ถัดไป →</span>
      )}
    </div>
  );
}
