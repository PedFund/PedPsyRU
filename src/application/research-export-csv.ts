/**
 * CSV serialization for future researcher exports. This module does not grant
 * access to responses or read from PostgreSQL. Authorization belongs to the
 * export endpoint and its storage adapter.
 *
 * All cells are quoted. Spreadsheet formula-like strings are prefixed with an
 * apostrophe before CSV escaping. This is a defense in depth for Excel-like
 * applications, not a substitute for treating exported data as untrusted.
 */
const FORMULA_START = /^[\u0000-\u0020\u007f-\u009f]*[=+\-@]/u;

export type ExportCell = string | number | boolean | null;

export function csvCell(value: ExportCell): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("CSV export requires finite numbers");
  }
  const raw = value === null ? "" : String(value);
  // Reject rather than truncate primary responses or silently change their value.
  if (raw.length > 32767) throw new RangeError("CSV cell exceeds spreadsheet limit");
  const safe = typeof value === "string" && FORMULA_START.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function csvRecord(values: readonly ExportCell[]): string {
  if (values.length > 256) throw new RangeError("CSV record has too many columns");
  return values.map(csvCell).join(",") + "\r\n";
}
