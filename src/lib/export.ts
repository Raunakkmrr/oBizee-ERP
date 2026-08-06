/**
 * Client-side file export.
 *
 * Real downloads, built in the browser from data already on screen — no server
 * round trip, which is why these could be wired while the backend is suspended
 * (DR-9). The GSTR-1 JSON in particular is the whole point of the GST screen:
 * an accountant's next step is uploading it to the GSTN offline tool, and a
 * button that produced nothing made the screen a report rather than a tool.
 */

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Freed on the next tick rather than immediately: revoking synchronously
  // races the download in Safari and produces a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJson(data: unknown, filename: string): void {
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}

/**
 * One CSV cell.
 *
 * Quoted whenever it contains a comma, a quote or a newline — a customer called
 * "Sharma, Bros" silently becomes two columns otherwise, and every figure to
 * its right shifts by one. Excel's own escape for a quote is a doubled quote.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The CSV text itself — pure, so the escaping can be tested without a DOM.
 *
 * The leading BOM is not decoration: without it Excel on Windows reads UTF-8 as
 * Latin-1 and every ₹ becomes â‚¹.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const body = [headers, ...rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  return `\uFEFF${body}`;
}

export function downloadCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
  filename: string,
): void {
  download(new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

/** `2026-08-06` — sortable, and unambiguous between date conventions. */
export function stampFor(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
