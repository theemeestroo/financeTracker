function escapeCSVField(value: string | number | boolean | null): string {
  const str = value === null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV<T extends Record<string, string | number | boolean | null>>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const headerLine = columns.map((c) => escapeCSVField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCSVField(row[c.key])).join(",")
  );
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}
