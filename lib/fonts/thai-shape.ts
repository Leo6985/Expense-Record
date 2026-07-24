import type jsPDF from "jspdf";

/**
 * jsPDF has no complex text shaping engine (no HarfBuzz). Sarabun's embedded font
 * tables include GPOS "mkmk" (mark-to-mark) data that tells a real shaper how far to
 * lift a tone/cancellation mark when it stacks on top of an upper vowel that's already
 * attached to the base consonant (e.g. "ที่" = ท + ิ + ่). Without that, jsPDF stamps
 * every character — including zero-width combining marks — at its own glyph-design
 * position, so the vowel and the mark land in the same vertical band and visually merge.
 *
 * These offsets replicate that lift manually. They were measured from the embedded
 * Sarabun glyf bounding boxes (vowel yMax minus tone-mark yMin, in font units out of a
 * 1000-unit em) and are specific to Sarabun — if the embedded font ever changes, these
 * need to be re-measured against the new font.
 */
const UPPER_VOWELS = "ัิีึื"; // ั ิ ี ึ ื
const STACKING_MARKS = "่้๊๋์"; // ่ ้ ๊ ๋ ์

const LIFT_UNITS: Record<"normal" | "bold", Record<string, number>> = {
  normal: { "ั": 230, "ิ": 207, "ี": 263, "ึ": 258, "ื": 263 },
  bold: { "ั": 243, "ิ": 227, "ี": 270, "ึ": 282, "ื": 270 },
};
const UNITS_PER_EM = 1000;

function needsLift(text: string): boolean {
  for (let i = 1; i < text.length; i++) {
    if (STACKING_MARKS.includes(text[i]) && UPPER_VOWELS.includes(text[i - 1])) return true;
  }
  return false;
}

/**
 * Patches a jsPDF instance's text() method in place so Thai upper vowels followed by a
 * tone/cancellation mark stack correctly instead of overlapping. Call once per document,
 * after registerThaiFont(). Only the `align` option is honored when a lift is applied —
 * fine for this codebase since no other doc.text() call site uses baseline/maxWidth/etc.
 */
export function patchThaiMarkStacking(doc: jsPDF) {
  const original = doc.text.bind(doc) as (
    text: string,
    x: number,
    y: number,
    options?: { align?: string }
  ) => jsPDF;

  const renderLine = (line: string, x: number, y: number, options?: { align?: string }) => {
    if (!needsLift(line)) {
      original(line, x, y, options);
      return;
    }

    const fullWidth = doc.getTextWidth(line);
    let cursorX = x;
    if (options?.align === "center") cursorX = x - fullWidth / 2;
    else if (options?.align === "right") cursorX = x - fullWidth;

    const fontStyle = doc.getFont().fontStyle === "bold" ? "bold" : "normal";
    const fontSizeMM = doc.getFontSize() / doc.internal.scaleFactor;

    let i = 0;
    while (i < line.length) {
      if (i > 0 && STACKING_MARKS.includes(line[i]) && UPPER_VOWELS.includes(line[i - 1])) {
        const liftUnits = LIFT_UNITS[fontStyle][line[i - 1]] ?? 240;
        const liftMM = (liftUnits / UNITS_PER_EM) * fontSizeMM;
        original(line[i], cursorX, y - liftMM);
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < line.length && !(STACKING_MARKS.includes(line[j]) && UPPER_VOWELS.includes(line[j - 1]))) {
        j++;
      }
      const run = line.slice(i, j);
      original(run, cursorX, y);
      cursorX += doc.getTextWidth(run);
      i = j;
    }
  };

  doc.text = ((text: string | string[], x: number, y: number, options?: { align?: string }) => {
    if (Array.isArray(text)) {
      const lineHeightMM = (doc.getFontSize() / doc.internal.scaleFactor) * doc.getLineHeightFactor();
      text.forEach((line, idx) => renderLine(line, x, y + idx * lineHeightMM, options));
      return doc;
    }
    renderLine(text, x, y, options);
    return doc;
  }) as typeof doc.text;
}
