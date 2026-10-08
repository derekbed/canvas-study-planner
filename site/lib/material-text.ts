const MAX_TEXT = 500_000;
export type Cell = { text: string; x: number; y: number };
export type PendingDate = { date: string; side: number };
const dateCell = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i;

export function scheduleWithColumns(cells: Cell[], pending: PendingDate[]) {
  const rows: Cell[][] = [];
  for (const cell of cells.filter(cell => cell.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(items => Math.abs(items[0].y - cell.y) < 2);
    if (row) row.push(cell); else rows.push([cell]);
  }
  rows.forEach(row => row.sort((a, b) => a.x - b.x));
  const dateRows = rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    row.length <= 2 && row.length > 0 && row.every(cell => dateCell.test(cell.text.trim())));
  if (dateRows.filter(({ row }) => row.length === 2).length < 2) return { text: "", pending: [] as PendingDate[] };
  const previous = pending.length ? rows.slice(0, dateRows[0].index).flat() : [];
  const pairs = pending.map(item => {
    const activity = previous.filter(cell => (cell.x < 215 ? 0 : 1) === item.side)
      .map(cell => cell.text.trim()).filter(Boolean).join(" ");
    return activity ? `${item.date}: ${activity}` : "";
  }).filter(Boolean);
  const nextPending: PendingDate[] = [];
  pairs.push(...dateRows.flatMap(({ row, index }, position) => {
    const nextIndex = dateRows[position + 1]?.index ?? rows.length;
    const split = row.length === 2 ? (row[0].x + row[1].x) / 2 : 215;
    const activities = rows.slice(index + 1, nextIndex).flat().filter(cell => cell.y >= row[0].y - 36);
    return row.map((date, column) => {
      const side = row.length === 2 ? column : date.x < split ? 0 : 1;
      const activity = activities.filter(cell => (cell.x < split ? 0 : 1) === side)
        .map(cell => cell.text.trim()).filter(Boolean).join(" ");
      if (!activity && position === dateRows.length - 1) nextPending.push({ date: date.text.trim(), side });
      return activity ? `${date.text.trim()}: ${activity}` : "";
    }).filter(Boolean);
  }));
  return { text: pairs.length ? `\nSchedule with dates matched to their columns:\n${pairs.join("\n")}` : "", pending: nextPending };
}

export async function extractMaterialText(file: File, suppliedText?: string) {
  if (suppliedText?.trim()) return suppliedText.slice(0, MAX_TEXT);
  if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith("text/"))
    return (await file.text()).slice(0, MAX_TEXT);
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return "";

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true, disableFontFace: true, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    let pending: PendingDate[] = [];
    let length = 0;
    let readableChars = 0;
    for (let number = 1; number <= Math.min(pdf.numPages, 200) && length < MAX_TEXT; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const cells = content.items.filter(item => "str" in item).map(item =>
        ({ text: item.str, x: item.transform[4], y: item.transform[5] }));
      const text = cells.map(cell => cell.text).join(" ").trim();
      readableChars += text.length;
      const schedule = scheduleWithColumns(cells, pending);
      pending = schedule.pending;
      const chunk = `[Page ${number}]\n${text}${schedule.text}`;
      pages.push(chunk);
      length += chunk.length + 1;
      page.cleanup();
    }
    return readableChars >= 25 ? pages.join("\n").slice(0, MAX_TEXT) : "";
  } finally { await task.destroy(); }
}
