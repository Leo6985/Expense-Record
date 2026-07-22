import { JWT } from "google-auth-library";

// Uses google-auth-library + raw REST calls instead of the `googleapis` package on purpose:
// `googleapis` is ~200MB/1800+ files (it bundles stubs for every Google API), which made
// Turbopack take 30s+ to compile any route touching this file, and would bloat the Vercel
// function bundle in production. This only needs the Sheets v4 REST surface.

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

let cachedAuth: JWT | undefined;
let cachedSheetIdByTitle: Map<string, number> | undefined;

function getAuth(): JWT {
  if (!cachedAuth) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    if (!email || !key) {
      throw new Error(
        "ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY ใน .env.local"
      );
    }
    cachedAuth = new JWT({
      email,
      // .env stores the key with literal "\n" sequences; convert back to real newlines
      key: key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return cachedAuth;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("ยังไม่ได้ตั้งค่า GOOGLE_SHEET_ID ใน .env.local");
  }
  return id;
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<unknown> {
  const auth = getAuth();
  const token = await auth.getAccessToken();
  const res = await fetch(`${SHEETS_API}/${getSpreadsheetId()}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets API ${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

/** Numeric sheetId (needed for row-delete requests) for a given tab title, cached per process. */
async function getSheetIdByTitle(title: string): Promise<number> {
  if (!cachedSheetIdByTitle) {
    const meta = (await sheetsFetch("")) as {
      sheets?: { properties: { title: string; sheetId: number } }[];
    };
    cachedSheetIdByTitle = new Map((meta.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]));
  }
  const sheetId = cachedSheetIdByTitle.get(title);
  if (sheetId === undefined) {
    throw new Error(`ไม่พบ tab ชื่อ "${title}" ใน Google Sheet — ต้องสร้าง tab และแถวหัวตารางก่อน`);
  }
  return sheetId;
}

/** Call after creating/renaming/deleting a tab so the next lookup re-reads spreadsheet metadata. */
export function invalidateSheetIdCache() {
  cachedSheetIdByTitle = undefined;
}

export type ColumnType = "string" | "number" | "boolean" | "date";

export type ColumnDef = {
  key: string;
  type: ColumnType;
};

function serializeCell(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return "";
  const raw = (() => {
    switch (type) {
      case "date":
        return value instanceof Date ? value.toISOString() : String(value);
      case "boolean":
        return value ? "TRUE" : "FALSE";
      case "number":
        return String(value);
      default:
        return String(value);
    }
  })();
  // Force plain-text storage (requires valueInputOption=USER_ENTERED to take effect —
  // Sheets strips this leading apostrophe on write). Without it, Sheets' backend
  // auto-detects number/date-looking strings and silently reformats them later
  // (e.g. long digit strings like a 13-digit tax ID become "1.05539E+11"), corrupting
  // the data even though we do our own type coercion via ColumnDef.type.
  return `'${raw}`;
}

function deserializeCell(raw: string | undefined, type: ColumnType): unknown {
  if (raw === undefined || raw === "") return null;
  switch (type) {
    case "date":
      return new Date(raw);
    case "boolean":
      return raw.toUpperCase() === "TRUE";
    case "number": {
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    }
    default:
      return raw;
  }
}

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function encodeRange(range: string) {
  return encodeURIComponent(range);
}

/**
 * Minimal Prisma-like CRUD over a single tab of one shared spreadsheet.
 * Row 1 of the tab must be the header row with exactly `columns[].key` in order.
 * Every read scans the whole tab (fine at the row counts this app expects);
 * every write re-reads first to avoid acting on a stale row index.
 */
export class SheetTable<T extends { id: string }> {
  constructor(
    private tabName: string,
    private columns: ColumnDef[]
  ) {}

  private rowToRecord(row: string[]): T {
    const obj: Record<string, unknown> = {};
    this.columns.forEach((col, i) => {
      obj[col.key] = deserializeCell(row[i], col.type);
    });
    return obj as T;
  }

  private recordToRow(record: Partial<T>): string[] {
    return this.columns.map((col) =>
      serializeCell((record as Record<string, unknown>)[col.key], col.type)
    );
  }

  private get range() {
    const lastCol = columnLetter(this.columns.length - 1);
    return `${this.tabName}!A2:${lastCol}`;
  }

  /** Returns records with their 0-based data-row index (row 2 in the sheet = index 0). */
  private async readAllWithIndex(): Promise<{ index: number; record: T }[]> {
    const res = (await sheetsFetch(`/values/${encodeRange(this.range)}`)) as { values?: string[][] };
    const rows = res.values ?? [];
    return rows
      .map((row, index) => ({ index, record: this.rowToRecord(row) }))
      .filter((r) => !!r.record.id);
  }

  async findMany(where?: (record: T) => boolean): Promise<T[]> {
    const all = await this.readAllWithIndex();
    return all.filter((r) => (where ? where(r.record) : true)).map((r) => r.record);
  }

  async findUnique(id: string): Promise<T | null> {
    const all = await this.readAllWithIndex();
    return all.find((r) => r.record.id === id)?.record ?? null;
  }

  async findFirst(where: (record: T) => boolean): Promise<T | null> {
    const all = await this.readAllWithIndex();
    return all.find((r) => where(r.record))?.record ?? null;
  }

  async create(data: Omit<T, "id"> & { id?: string }): Promise<T> {
    const record = { ...data, id: data.id ?? crypto.randomUUID() } as T;
    await sheetsFetch(`/values/${encodeRange(this.range)}:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      body: JSON.stringify({ values: [this.recordToRow(record)] }),
    });
    return record;
  }

  /** Appends many records in a single API call — use for bulk import/migration to avoid per-row rate limits. */
  async createMany(dataList: (Omit<T, "id"> & { id?: string })[]): Promise<T[]> {
    if (dataList.length === 0) return [];
    const records = dataList.map((data) => ({ ...data, id: data.id ?? crypto.randomUUID() }) as T);
    await sheetsFetch(`/values/${encodeRange(this.range)}:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      body: JSON.stringify({ values: records.map((r) => this.recordToRow(r)) }),
    });
    return records;
  }

  async update(id: string, data: Partial<Omit<T, "id">>): Promise<T> {
    const all = await this.readAllWithIndex();
    const found = all.find((r) => r.record.id === id);
    if (!found) throw new Error(`ไม่พบข้อมูล id=${id} ใน ${this.tabName}`);

    const updated = { ...found.record, ...data } as T;
    const sheetRow = found.index + 2; // +1 for header row, +1 for 1-based sheet rows
    const lastCol = columnLetter(this.columns.length - 1);
    await sheetsFetch(
      `/values/${encodeRange(`${this.tabName}!A${sheetRow}:${lastCol}${sheetRow}`)}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [this.recordToRow(updated)] }) }
    );
    return updated;
  }

  /** Updates many records in a single API call — use for bulk import to avoid per-row rate limits. */
  async updateMany(updates: { id: string; data: Partial<Omit<T, "id">> }[]): Promise<void> {
    if (updates.length === 0) return;
    const all = await this.readAllWithIndex();
    const foundById = new Map(all.map((r) => [r.record.id, r]));
    const lastCol = columnLetter(this.columns.length - 1);

    const data = updates
      .map((u) => {
        const found = foundById.get(u.id);
        if (!found) return null;
        const merged = { ...found.record, ...u.data } as T;
        const sheetRow = found.index + 2;
        return {
          range: `${this.tabName}!A${sheetRow}:${lastCol}${sheetRow}`,
          values: [this.recordToRow(merged)],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (data.length === 0) return;
    await sheetsFetch("/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
  }

  async delete(id: string): Promise<void> {
    return this.deleteWhere((r) => r.id === id);
  }

  /** Deletes every row matching the predicate in a single API call. */
  async deleteWhere(where: (record: T) => boolean): Promise<void> {
    const all = await this.readAllWithIndex();
    const matches = all.filter((r) => where(r.record));
    if (matches.length === 0) return;

    const sheetId = await getSheetIdByTitle(this.tabName);
    // Delete from the bottom up within one batchUpdate so earlier deletions don't shift
    // the row indices that later requests in the same batch still reference.
    const sortedDesc = [...matches].sort((a, b) => b.index - a.index);
    await sheetsFetch(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: sortedDesc.map(({ index }) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS" as const,
              startIndex: index + 1,
              endIndex: index + 2,
            },
          },
        })),
      }),
    });
  }

  /** Replaces every row matching `where` with `newRecords` in two API calls — for the
   * common "delete all children of a parent, then recreate them" pattern. */
  async replaceWhere(where: (record: T) => boolean, newRecords: (Omit<T, "id"> & { id?: string })[]): Promise<T[]> {
    await this.deleteWhere(where);
    return this.createMany(newRecords);
  }
}

/** Creates a tab with the given header row if it doesn't already exist. Safe to call repeatedly. */
export async function ensureTab(tabName: string, columns: ColumnDef[]): Promise<void> {
  const meta = (await sheetsFetch("")) as { sheets?: { properties?: { title?: string } }[] };
  const exists = (meta.sheets ?? []).some((s) => s.properties?.title === tabName);

  if (!exists) {
    await sheetsFetch(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    invalidateSheetIdCache();
  }

  await sheetsFetch(`/values/${encodeRange(`${tabName}!A1`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [columns.map((c) => c.key)] }),
  });
}
