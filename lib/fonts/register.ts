import type jsPDF from "jspdf";
import { SARABUN_REGULAR_BASE64, SARABUN_BOLD_BASE64 } from "./sarabun-base64";

/**
 * Embeds the Sarabun Thai font into a jsPDF instance's VFS and switches the
 * document to it. jsPDF's built-in fonts (helvetica/times/courier) have no Thai
 * glyphs, so Thai text renders blank/garbled without this. Must be called once
 * per jsPDF instance — the VFS is not shared across documents.
 */
export function registerThaiFont(doc: jsPDF) {
  doc.addFileToVFS("Sarabun-Regular.ttf", SARABUN_REGULAR_BASE64);
  doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", SARABUN_BOLD_BASE64);
  doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
  doc.setFont("Sarabun", "normal");
}
