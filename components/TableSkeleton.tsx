const WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-20"];

export function TableSkeleton({
  cols = 5,
  rows = 8,
  hasSearch = true,
  hasButton = true,
}: {
  cols?: number;
  rows?: number;
  hasSearch?: boolean;
  hasButton?: boolean;
}) {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 bg-gray-200 rounded-lg w-48" />
        {hasButton && <div className="h-9 bg-gray-200 rounded-lg w-32" />}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {hasSearch && (
          <div className="p-4 border-b border-gray-100 flex gap-3">
            <div className="h-9 bg-gray-100 rounded-lg flex-1" />
            <div className="h-9 bg-gray-100 rounded-lg w-32" />
            <div className="h-9 bg-gray-100 rounded-lg w-20" />
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <div className="h-3.5 bg-gray-200 rounded w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri} className="border-b border-gray-100">
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="px-4 py-3">
                    <div className={`h-4 bg-gray-100 rounded ${WIDTHS[(ri + ci) % WIDTHS.length]}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
