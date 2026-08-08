<p align="center">
  <img src="public/logo.png" alt="RemoveMyID logo" width="96" height="96">
</p>

<h1 align="center">RemoveMyID</h1>

<p align="center"><strong>Redact personal data from your files without it ever leaving your browser.</strong></p>

<p align="center">
  <a href="https://github.com/Sinaini/removemyid/actions/workflows/ci.yml"><img src="https://github.com/Sinaini/removemyid/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"></a>
</p>

RemoveMyID is a 100% client-side PII redaction tool. Drop in a `.txt`, `.csv`, `.pdf`, or image file, choose what to scrub, and get a redacted copy back — no upload, no backend, no third party ever sees the file. Every byte of processing happens locally — in a Web Worker for text, and via in-browser OCR for images — using regex and lightweight NLP running in your own browser tab.

🔗 **Live demo:** [removemyid.com](https://www.removemyid.com)

## Why

Most "redact my PDF" tools are a file upload to someone else's server. RemoveMyID's privacy guarantee isn't a policy promise — it's architectural: there is no server in this app at all. Everything from parsing to redaction to rebuilding the output file happens in your tab, and you can disconnect from the internet after the page loads and it still works.

## Features

- **Detects and redacts:** email addresses, phone numbers, credit card numbers (Luhn-checked), IBANs (mod-97), bank routing numbers (ABA), long account/reference numbers, Social Security Numbers, national ID numbers, passport and driving licence numbers, API keys and credentials, IP and MAC addresses, web addresses, names, addresses, postal codes, dates, and ages — grouped in the UI so the list stays navigable
- **Choose how values are replaced:** the literal `[REDACTED]`, category labels (`[EMAIL]`, `[NAME]`), or consistent pseudonyms (`[PERSON_1]`) where the same value always maps to the same token, so a redacted dataset stays analysable and joinable
- **Format-tolerant phone matching:** typing `0543990303` will find `054-3990303`, `+1 (415) 555-2671`, etc. in the file regardless of how it's formatted
- **Fine-grained control:** toggle any category on/off, or target specific values only (e.g. redact just one name, leave the rest) — comma-separated lists supported
- **Review it yourself:** for text-based files the results screen shows the document with every match highlighted in place. Click a highlight to keep it (and click again to change your mind), or select any text the detectors missed and redact it — one occurrence or every occurrence. Detection is heuristic, so this is the escape hatch that makes it trustworthy
- **Transparent results:** the results screen shows exactly what was found and redacted per category, not just a count
- **Preview before you commit:** open the redacted file in a new tab before downloading it
- **PDF redaction that's actually secure:** pages are rasterized to an image and the redaction boxes are drawn on the flattened image, so there's no underlying text layer left to copy/extract after redaction — unlike tools that just draw a black box over selectable text
- **Image redaction via on-device OCR:** upload a photo, screenshot, or scanned ID (`.jpg`, `.png`, `.webp`) and PII visible in the image itself is found with in-browser OCR (English, Hebrew, Spanish, French, German) and blacked out on the flattened image — plus all EXIF metadata (GPS coordinates, device info, timestamps) is stripped as a side effect
- **Runs entirely offline** after the initial page load, including OCR — the language model and OCR engine ship with the app instead of being fetched from a CDN

## How it works

1. **Upload** — a file is read locally via the File API; it never touches `fetch`, `XMLHttpRequest`, or any network call.
2. **Configure** — choose which PII categories to redact and optionally narrow any category to specific values.
3. **Redact:**
   - `.txt` / `.csv` / `.json` / `.md` / `.html` — the file's encoding is detected (UTF-8, UTF-16, or a legacy single-byte encoding), then the text is sent to a **Web Worker** running the regex pipeline plus [compromise.js](https://github.com/spencermountain/compromise) for name/place NER. CSV is parsed as CSV rather than as plain text, so a replacement landing inside a quoted field cannot break the row structure.
   - `.pdf` — [pdfjs-dist](https://github.com/mozilla/pdf.js) extracts per-page text, inserting word spacing derived from the actual glyph geometry rather than concatenating runs blindly. The same detection pipeline finds PII, each page is rendered to a canvas, and black boxes are drawn as rotated quads built from the full text matrix, so they stay over the text on rotated pages. Right-to-left runs are covered whole, because measuring a bidi run left-to-right places the box beside the text. Pages with too little text to be their own content are also read with OCR, so a scan carrying a stamped header can't slip through. The flattened page image is embedded into a brand-new PDF via [pdf-lib](https://github.com/Hopding/pdf-lib), and the original text layer is discarded entirely.
   - `.jpg` / `.png` / `.webp` — the image is drawn to a canvas, [Tesseract.js](https://github.com/naptha/tesseract.js) OCRs it locally to recover text with word-level bounding boxes, the same detection pipeline finds PII in the recognized text, black boxes are drawn over the matched words, and the canvas is re-encoded back to an image. Re-encoding through canvas also drops all EXIF metadata.
4. **Results** — see exactly what was redacted, preview the output, or download it.

## Tech stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [react-dropzone](https://react-dropzone.js.org/) for the upload UI
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) for PDF parsing/rendering
- [pdf-lib](https://pdf-lib.js.org/) for PDF generation
- [compromise](https://compromise.cool/) for lightweight in-browser NLP
- [Tesseract.js](https://github.com/naptha/tesseract.js) for in-browser OCR on images
- [lucide-react](https://lucide.dev/) for icons

## Getting started

```bash
git clone https://github.com/Sinaini/removemyid.git
cd removemyid
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build locally
npm run lint      # oxlint
```

No environment variables, no API keys, no backend to stand up — it's a static site.

## Project structure

```
src/
  components/
    layout/        Header, Footer, StepLayout (shared wizard chrome)
    pages/          LandingPage, UploadPage, ConfigurePage, ResultsPage
    landing/        Hero, TrustSection, RedactionSummaryPanel
  lib/
    redaction/      regex + NLP detectors, category metadata, options model
    files/          text/CSV file → Blob pipeline
    pdf/            PDF text extraction + canvas redaction + pdf-lib flattening
    images/         OCR (Tesseract.js) + canvas redaction for image files
  hooks/            useRedactionWorker — talks to the Web Worker
  workers/          redaction.worker.ts — runs the redaction pipeline off the main thread
  types/            shared TypeScript types
```

## Known limitations

- Detection is regex/NLP-based, not a trained ML model — it will miss some formats and occasionally over- or under-match. Treat it as a strong first pass, not a compliance guarantee.
- PDF redaction rasterizes every page to an image. This is the tradeoff for guaranteeing no residual text — it also means the output PDF loses selectable text and any vector content.
- Large multi-page PDFs are slower, since each page does a full canvas render + PNG encode + embed.
- Image redaction depends on OCR accuracy: blurry, low-contrast, handwritten, or heavily stylized text may be missed entirely. OCR text recognition covers English, Hebrew, Spanish, French, and German, but the name/place detector (compromise.js) is English-only, so names and addresses in other languages won't be caught — only the regex-based categories (email, phone, credit card, SSN, date) are language-independent. Redaction boxes cover whole OCR-recognized words, which can be coarser than the PDF path's character-precise boxes.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
