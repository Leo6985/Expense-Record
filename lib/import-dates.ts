// Shared by every CSV/XLSX import that accepts a date column (sales invoices, accounts
// payable, ...). `new Date(string)` is locale-ambiguous for slash-separated dates — it reads
// "12/05/2026" as MM/DD/YYYY (US), silently swapping day and month for any DD/MM/YYYY input
// (the format the rest of this app displays and import UIs instruct users to type when not
// using the ISO example). Parse both supported formats explicitly instead of trusting the
// built-in parser — and never fall back to it, since that fallback is exactly what
// reintroduces the MM/DD misread (e.g. for "21/08/2026 0:00:00", a trailing time from an Excel
// date/time cell, which doesn't match either strict pattern below).
export function parseImportDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // Accepts DD/MM/YYYY with "/", "-", or "." as the separator, and tolerates a trailing
  // time component (e.g. from an Excel date/time cell exported to CSV as text).
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T].*)?$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    if (Number(m) > 12) return null;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
