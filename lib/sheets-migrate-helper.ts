import { SheetTable } from "./sheets";

/** Copies rows that don't already exist in the sheet (matched by id). Never touches Postgres. */
export async function copyMissingToSheet<T extends { id: string }>(
  modelName: string,
  pgRows: T[],
  table: SheetTable<T>
): Promise<boolean> {
  const existing = await table.findMany();
  const existingIds = new Set(existing.map((r) => r.id));
  const toCopy = pgRows.filter((r) => !existingIds.has(r.id));

  await table.createMany(toCopy);

  const afterCount = (await table.findMany()).length;
  console.log(
    `[${modelName}] คัดลอกใหม่ ${toCopy.length} รายการ, ข้าม (มีอยู่แล้ว) ${pgRows.length - toCopy.length} รายการ`
  );
  console.log(`[${modelName}] จำนวนแถวใน Sheet: ${afterCount} / Postgres: ${pgRows.length}`);

  if (afterCount !== pgRows.length) {
    console.error(`[${modelName}] ⚠️  จำนวนไม่ตรงกัน — กรุณาตรวจสอบก่อนดำเนินการต่อ`);
    return false;
  }
  console.log(`[${modelName}] ✅ จำนวนตรงกัน`);
  return true;
}

/** Field-by-field comparison between Postgres rows and their Sheet mirror. Read-only both sides. */
export async function verifyAgainstSheet<T extends { id: string }>(
  modelName: string,
  pgRows: Record<string, unknown>[],
  table: SheetTable<T>,
  fields: string[]
): Promise<boolean> {
  const sheetRows = await table.findMany();
  const sheetById = new Map(sheetRows.map((r) => [r.id, r as unknown as Record<string, unknown>]));

  let mismatches = 0;
  for (const pg of pgRows) {
    const id = pg.id as string;
    const sh = sheetById.get(id);
    if (!sh) {
      console.error(`[${modelName}] MISSING in sheet: ${id}`);
      mismatches++;
      continue;
    }
    for (const f of fields) {
      const pgVal = pg[f];
      const shVal = sh[f];
      if (String(pgVal ?? "") !== String(shVal ?? "")) {
        console.error(`[${modelName}] MISMATCH ${id}.${f}: pg=${JSON.stringify(pgVal)} sheet=${JSON.stringify(shVal)}`);
        mismatches++;
      }
    }
  }

  console.log(
    `[${modelName}] ตรวจสอบ ${pgRows.length} รายการ: ${mismatches === 0 ? "✅ ตรงกันทั้งหมด" : `❌ พบ ${mismatches} จุดที่ไม่ตรงกัน`}`
  );
  return mismatches === 0;
}
