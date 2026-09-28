export type IcsEntry = {
  uid: string;
  title: string;
  description: string;
  startsAt: string;
  url: string | null;
};

function unfold(input: string) {
  return input.replace(/\r?\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function propertyValue(line: string) {
  const index = line.indexOf(":");
  return index === -1 ? "" : line.slice(index + 1);
}

function parseDate(value: string) {
  const raw = value.trim();
  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T23:59:00`).toISOString();
  const utc = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utc) return new Date(`${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`).toISOString();
  const floating = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (floating) return new Date(`${floating[1]}-${floating[2]}-${floating[3]}T${floating[4]}:${floating[5]}:${floating[6]}`).toISOString();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function parseIcsCalendar(input: string): IcsEntry[] {
  const lines = unfold(input).split(/\r?\n/);
  const entries: IcsEntry[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const startsAt = parseDate(current.DTSTART || current.DUE || "");
        const title = unescapeIcs(current.SUMMARY || "");
        if (startsAt && title) {
          entries.push({
            uid: unescapeIcs(current.UID || `${title}-${startsAt}`),
            title,
            description: unescapeIcs(current.DESCRIPTION || ""),
            startsAt,
            url: current.URL ? unescapeIcs(current.URL) : null,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const key = line.split(":", 1)[0]?.split(";", 1)[0];
    if (!key) continue;
    if (["UID", "SUMMARY", "DESCRIPTION", "DTSTART", "DUE", "URL"].includes(key)) current[key] = propertyValue(line);
  }

  return entries;
}
