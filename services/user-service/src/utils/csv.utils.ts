/**
 * csv.utils.ts
 * Lightweight CSV parsing utility using Node.js readline.
 * No external CSV library dependency — avoids binary native modules.
 */
import { Readable } from 'node:stream';
import readline from 'node:readline';

export type CsvRow = Record<string, string>;

/**
 * Parse a Buffer of CSV content into an array of row objects.
 * The first row is treated as the header.
 * Handles quoted fields (RFC 4180 subset).
 */
export async function parseCsvBuffer(buffer: Buffer): Promise<CsvRow[]> {
  const rows: CsvRow[] = [];
  const stream = Readable.from(buffer);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] = [];
  let isFirst = true;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = parseCsvLine(trimmed);

    if (isFirst) {
      headers = fields.map((h) => h.trim().toLowerCase());
      isFirst = false;
      continue;
    }

    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = fields[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line into fields, respecting double-quoted values.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Convert an array of objects to CSV string.
 * Automatically determines headers from the first object's keys.
 */
export function toCsvString(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const headers = columns ?? Object.keys(rows[0]!);
  const escapeField = (v: unknown) => {
    const str = String(v ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const header = headers.join(',');
  const body = rows.map((r) => headers.map((h) => escapeField(r[h])).join(','));
  return [header, ...body].join('\n');
}
