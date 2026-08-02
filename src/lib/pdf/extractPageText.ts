import type { PDFPageProxy } from "pdfjs-dist";

export interface PdfTextItem {
  str: string;
  start: number;
  end: number;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export interface PdfFontStyle {
  fontFamily: string;
}

export interface PageTextData {
  text: string;
  items: PdfTextItem[];
  styles: Record<string, PdfFontStyle>;
}

export async function extractPageText(
  page: PDFPageProxy
): Promise<PageTextData> {
  const content = await page.getTextContent();
  const items: PdfTextItem[] = [];
  let text = "";

  for (const raw of content.items) {
    if (!("str" in raw)) continue;

    if (raw.str.length > 0) {
      const start = text.length;
      text += raw.str;
      items.push({
        str: raw.str,
        start,
        end: text.length,
        transform: raw.transform,
        width: raw.width,
        height: raw.height,
        fontName: raw.fontName,
      });
    }

    if (raw.hasEOL) {
      text += "\n";
    }
  }

  return { text, items, styles: content.styles };
}
