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

/* ---------------------------------------------------- FR-1002 XLSX + why */

export type Provenance = {
  /** The screen the figures came from. */
  source: string;
  /** Every filter in force, in words — "Week to 2 Aug 2026 · All branches". */
  filters: string;
  exportedBy: string;
  exportedAt: string;
};

/**
 * A real workbook, with a second sheet saying where the numbers came from.
 *
 * FR-1002 asks for filters *and provenance*, and that second half is the part
 * that matters: a spreadsheet lands in an accountant's inbox with no memory of
 * which period or branch produced it, and a figure whose filters are unknown is
 * a figure nobody can defend in a review. The sheet travels with the file, so
 * the two cannot be separated.
 *
 * CSV is kept alongside rather than replaced — it is what opens on a phone.
 */
export async function downloadXlsx(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
  provenance: Provenance,
  filename: string,
): Promise<void> {
  /*
    The browser entry point specifically. The package ships separate `node` and
    `browser` builds and has no root export — importing the node one into a
    client bundle pulls in `fs` and fails at build, not at run.

    Imported dynamically so the workbook writer is only fetched when somebody
    actually exports, rather than riding in every page's bundle.
  */
  const writeXlsxFile = (await import("write-excel-file/browser")).default;

  const data = [
    headers.map((value) => ({ value, fontWeight: "bold" as const })),
    ...rows.map((row) =>
      row.map((cell) =>
        typeof cell === "number"
          ? { value: cell, type: Number }
          : { value: cell ?? "", type: String },
      ),
    ),
  ];

  const about = [
    [{ value: "Where these figures came from", fontWeight: "bold" as const }],
    [{ value: "Screen", type: String }, { value: provenance.source, type: String }],
    [{ value: "Filters", type: String }, { value: provenance.filters, type: String }],
    [{ value: "Exported by", type: String }, { value: provenance.exportedBy, type: String }],
    [{ value: "Exported at", type: String }, { value: provenance.exportedAt, type: String }],
    [{ value: "Rows", type: String }, { value: rows.length, type: Number }],
  ];

  // The multi-sheet overload takes one object per sheet, each carrying its own
  // name — not a parallel `sheets` array, which silently type-errors into the
  // single-sheet overload.
  /*
    The browser build hands back a workbook and downloads on `toFile`; only the
    node build takes a `fileName` option. Getting these two confused produces a
    workbook that is built correctly and never reaches the user.
  */
  const workbook = await writeXlsxFile([
    { data, sheet: "Data" },
    { data: about, sheet: "About this export" },
  ]);
  await workbook.toFile(filename);
}

/** `2026-08-06` — sortable, and unambiguous between date conventions. */
export function stampFor(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
