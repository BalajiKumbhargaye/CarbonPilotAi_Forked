import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { IExtractionField } from '@carbonpilot/shared';

const nodeRequire = createRequire(__filename);

const pdfWorkerUrl = (() => {
  try {
    return pathToFileURL(
      nodeRequire.resolve('pdfjs-dist/build/pdf.worker.mjs')
    ).href;
  } catch {
    try {
      return pathToFileURL(
        nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
      ).href;
    } catch {
      return null;
    }
  }
})();

if (pdfWorkerUrl && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export type ExtractionMethod =
  | 'NATIVE_TEXT'
  | 'OCR'
  | 'NATIVE_TEXT_AND_OCR';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: 'NATIVE_TEXT' | 'OCR';
  confidence?: number;
}

export interface DocumentExtractionPayload {
  method: ExtractionMethod;
  text: string;
  pages: ExtractedPage[];
  language: string;
  errorMessage?: string;
  fields: IExtractionField[];
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function hasMeaningfulText(value: string): boolean {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return false;
  }

  if (normalized.length < 80) {
    return /\b[a-zA-Z]{3,}\b/.test(normalized);
  }

  return true;
}

function pageTextFromTokens(
  items: Array<{ str?: string; hasEOL?: boolean }>
): string {
  return normalizeWhitespace(items.map((item) =>
    `${typeof item.str === 'string' ? item.str : ''}${item.hasEOL ? '\n' : ' '}`
  ).join(''));
}

function normalizeCarbonText(value: string): string {
  return value
    .replace(/CO₂/gi, 'CO2')
    .replace(/CO₂e/gi, 'CO2e')
    .replace(/CO2-EQ/gi, 'CO2e')
    .replace(/CO2 EQ/gi, 'CO2e')
    .replace(/CO2E/gi, 'CO2e');
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                         */
/* -------------------------------------------------------------------------- */

async function loadPdf(buffer: Buffer) {
  return pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  }).promise;
}

async function extractPdfNativeText(
  buffer: Buffer
): Promise<ExtractedPage[]> {
  const pdf = await loadPdf(buffer);

  const pages: ExtractedPage[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const page = await pdf.getPage(pageNumber);

    try {
      const textContent = await page.getTextContent();

      const text = pageTextFromTokens(
        textContent.items as Array<{ str?: string; hasEOL?: boolean }>
      );

      if (text) {
        pages.push({
          pageNumber,
          text,
          method: 'NATIVE_TEXT',
        });
      }
    } finally {
      page.cleanup();
    }
  }

  return pages;
}

async function renderPdfPageToPng(
  pdf: Awaited<ReturnType<typeof loadPdf>>,
  pageNumber: number
): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);

  try {
    const viewport = page.getViewport({
      scale: 2.0,
    });

    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );

    const context = canvas.getContext('2d');

    await page.render({
      canvas: null,
      canvasContext: context as never,
      viewport,
    }).promise;

    return canvas.toBuffer('image/png');
  } finally {
    page.cleanup();
  }
}

/* -------------------------------------------------------------------------- */
/* OCR                                                                         */
/* -------------------------------------------------------------------------- */

async function runTesseractOnBuffer(
  buffer: Buffer,
  language: string
): Promise<{
  text: string;
  confidence?: number;
}> {
  const result = await Tesseract.recognize(
    buffer,
    language,
    {
      logger: () => undefined,
      langPath: process.env.OCR_LANGUAGE_PATH || path.resolve(__dirname, '../../../'),
    }
  );

  const text = normalizeWhitespace(
    result.data.text || ''
  );

  const confidence =
    typeof result.data.confidence === 'number'
      ? Math.max(
          0,
          Math.min(1, result.data.confidence / 100)
        )
      : undefined;

  return {
    text,
    confidence,
  };
}

async function extractImageTextWithOcr(
  buffer: Buffer,
  language: string
): Promise<ExtractedPage[]> {
  const result = await runTesseractOnBuffer(
    buffer,
    language
  );

  if (!result.text) {
    return [];
  }

  return [
    {
      pageNumber: 1,
      text: result.text,
      method: 'OCR',
      confidence: result.confidence,
    },
  ];
}

async function extractScannedPdfTextWithOcr(
  buffer: Buffer,
  language: string
): Promise<ExtractedPage[]> {
  const pdf = await loadPdf(buffer);

  const pages: ExtractedPage[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const imageBuffer = await renderPdfPageToPng(
      pdf,
      pageNumber
    );

    const result = await runTesseractOnBuffer(
      imageBuffer,
      language
    );

    if (result.text) {
      pages.push({
        pageNumber,
        text: result.text,
        method: 'OCR',
        confidence: result.confidence,
      });
    }
  }

  return pages;
}

/* -------------------------------------------------------------------------- */
/* File Types                                                                  */
/* -------------------------------------------------------------------------- */

export function isImageMimeType(
  mimeType: string
): boolean {
  return [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ].includes(mimeType.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Carbon / PCF extraction                                                     */
/* -------------------------------------------------------------------------- */

interface CarbonMatch {
  value: number;
  unit: string;
  raw: string;
}

function parseNumber(value: string): number | null {
  let normalized = value.trim();

  /*
   * Handles:
   * 1,250
   * 1.250
   * 12.5
   * 12,5
   * 1,250.50
   * 1.250,50
   */

  if (
    normalized.includes(',') &&
    normalized.includes('.')
  ) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');

    if (lastComma > lastDot) {
      normalized = normalized
        .replace(/\./g, '')
        .replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');

    if (
      parts.length === 2 &&
      parts[1].length <= 2
    ) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  const number = Number(
    normalized.replace(/[^\d.-]/g, '')
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function extractCarbonValues(
  text: string
): CarbonMatch[] {
  const normalized = normalizeCarbonText(text);

  /*
   * Supports:
   *
   * 25 kgCO2e/kg
   * 25 kg CO2e/kg
   * 25 kg CO2e / kg
   * 25 kgCO2e
   * 25 tCO2e
   * 25 kg CO2e/unit
   * 25 kg CO2e per kg
   * 25 kg CO2e per unit
   */

  const regex =
    /([\d]+(?:[.,][\d]+)*)\s*(kg\s*CO2e\s*(?:\/\s*kg|\/\s*unit|per\s*kg|per\s*unit)?|t\s*CO2e\s*(?:\/\s*t|per\s*t)?|kg\s*CO2e|t\s*CO2e)/gi;

  const matches: CarbonMatch[] = [];

  for (const match of normalized.matchAll(regex)) {
    const rawNumber = match[1];
    const rawUnit = normalizeWhitespace(match[2]);

    const value = parseNumber(rawNumber);

    if (value === null) {
      continue;
    }

    const unit = rawUnit
      .replace(/\s+/g, '')
      .replace(/per/gi, '/');

    matches.push({
      value,
      unit,
      raw: match[0],
    });
  }

  return matches;
}

/* -------------------------------------------------------------------------- */
/* Generic Fields                                                              */
/* -------------------------------------------------------------------------- */

export function buildGenericFields(
  text: string,
  pages: ExtractedPage[],
  method: ExtractionMethod
): IExtractionField[] {
  const fields: IExtractionField[] = [];

  const allText = normalizeWhitespace(text);

  /* ----------------------------- Document text ---------------------------- */

  if (allText) {
    fields.push({
      field: 'DOCUMENT_TEXT',
      value: allText,
      sourceText: allText.slice(0, 250),
      extractionStatus: 'EXTRACTED',
    });
  }

  /* ------------------------------- Page text ------------------------------ */

  for (const page of pages) {
    const safeText = normalizeWhitespace(page.text);

    if (!safeText) {
      continue;
    }

    fields.push({
      field: 'PAGE_TEXT',
      value: safeText,
      page: page.pageNumber,
      sourceText: safeText.slice(0, 250),
      extractionStatus: 'EXTRACTED',
    });
  }

  const labeledPatterns: Array<{ field: string; pattern: RegExp; valueIndex?: number; unitIndex?: number }> = [
    { field: 'PRODUCT_NAME', pattern: /^\s*(?:product(?:\s+name)?|product\s+description)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'PRODUCT_CODE', pattern: /^\s*(?:product\s+code|sku|product\s+id)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'SUPPLIER_NAME', pattern: /^\s*(?:supplier(?:\s+name)?|manufacturer)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'FACILITY', pattern: /^\s*(?:facility|facility\s+name|site|plant)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'FUNCTIONAL_UNIT', pattern: /^\s*(?:functional|declared)\s+unit\s*[:=]\s*(.+?)\s*$/i },
    { field: 'LIFECYCLE_BOUNDARY', pattern: /^\s*(?:lifecycle\s+)?(?:boundary|system\s+boundary)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'METHODOLOGY', pattern: /^\s*(?:methodology|method|standard)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'REPORTING_PERIOD', pattern: /^\s*(?:reporting\s+period|reporting\s+year|period)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'CERTIFICATE_TYPE', pattern: /^\s*certificate\s+type\s*[:=]\s*(.+?)\s*$/i },
    { field: 'CERTIFICATE_NUMBER', pattern: /^\s*certificate\s+(?:number|no\.?)\s*[:=]\s*(.+?)\s*$/i },
    { field: 'CERTIFICATE_ISSUER', pattern: /^\s*certificate\s+issuer\s*[:=]\s*(.+?)\s*$/i },
    { field: 'CERTIFICATE_ISSUE_DATE', pattern: /^\s*(?:certificate\s+)?issue\s+date\s*[:=]\s*(.+?)\s*$/i },
    { field: 'CERTIFICATE_EXPIRY_DATE', pattern: /^\s*(?:certificate\s+)?(?:expiry|expiration)\s+date\s*[:=]\s*(.+?)\s*$/i },
  ];

  const pageSources = pages.length ? pages : [{ pageNumber: 1, text, method: 'NATIVE_TEXT' as const }];
  for (const page of pageSources) {
    const lines = page.text.split(/\r?\n/).map(normalizeWhitespace).filter(Boolean);
    for (const line of lines) {
      for (const { field, pattern } of labeledPatterns) {
        const match = line.match(pattern);
        if (!match?.[1]) continue;
        fields.push({
          field,
          value: match[1],
          page: page.pageNumber,
          confidence: page.confidence,
          sourceText: line,
          extractionStatus: 'EXTRACTED',
        });
      }

      const carbonMatches = extractCarbonValues(line);
      if (carbonMatches.length && /(?:pcf|product\s+carbon\s+footprint|carbon\s+footprint|carbon\s+intensity)/i.test(line)) {
        const carbon = carbonMatches[0];
        fields.push({
          field: 'PCF_VALUE',
          value: carbon.value,
          unit: carbon.unit,
          page: page.pageNumber,
          confidence: page.confidence,
          sourceText: line,
          extractionStatus: 'EXTRACTED',
        });
      }

      const percentage = line.match(/^\s*(recycled\s+content|recycled\s+material(?:\s+content)?|renewable\s+(?:energy|electricity)(?:\s+percentage|\s+share)?)\s*[:=]\s*([\d.,]+)\s*%/i);
      if (percentage) {
        const field = /recycled/i.test(percentage[1]) ? 'RECYCLED_CONTENT' : 'RENEWABLE_ENERGY_PERCENTAGE';
        const value = parseNumber(percentage[2]);
        if (value !== null) fields.push({
          field,
          value,
          unit: '%',
          page: page.pageNumber,
          confidence: page.confidence,
          sourceText: line,
          extractionStatus: 'EXTRACTED',
        });
      }

      const scope = line.match(/^\s*scope\s*([123])(?:\s+emissions?)?\s*[:=]\s*([\d.,]+)\s*(kg\s*CO2e|t\s*CO2e)?/i);
      if (scope) {
        const value = parseNumber(scope[2]);
        const unit = scope[3]?.replace(/\s+/g, '');
        if (value !== null) fields.push({
          field: `SCOPE_${scope[1]}`,
          value,
          unit,
          page: page.pageNumber,
          confidence: page.confidence,
          sourceText: line,
          extractionStatus: 'EXTRACTED',
        });
      }

      const quantity = line.match(/^\s*quantity\s*[:=]\s*([\d.,]+)\s*([a-zA-Z]+)?/i);
      if (quantity) {
        const value = parseNumber(quantity[1]);
        if (value !== null) fields.push({
          field: 'QUANTITY',
          value,
          unit: quantity[2],
          page: page.pageNumber,
          confidence: page.confidence,
          sourceText: line,
          extractionStatus: 'EXTRACTED',
        });
      }
    }
  }

  return fields;
}

/* -------------------------------------------------------------------------- */
/* Main Extraction Function                                                    */
/* -------------------------------------------------------------------------- */

export async function extractDocumentTextFromBuffer(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  options: {
    language?: string;
  } = {}
): Promise<DocumentExtractionPayload> {
  const language =
    options.language ||
    process.env.OCR_LANGUAGE ||
    'eng';

  const ext = path
    .extname(fileName)
    .toLowerCase();

  /* ------------------------------------------------------------------------ */
  /* PDF                                                                       */
  /* ------------------------------------------------------------------------ */

  if (
    ext === '.pdf' ||
    mimeType.toLowerCase() === 'application/pdf'
  ) {
    try {
      const nativePages =
        await extractPdfNativeText(buffer);

      const nativeText = nativePages
        .map((page) => page.text)
        .join(' ');

      /* ------------------------ Native PDF text --------------------------- */

      if (hasMeaningfulText(nativeText)) {
        return {
          method: 'NATIVE_TEXT',
          text: normalizeWhitespace(nativeText),
          pages: nativePages,
          language,
          fields: buildGenericFields(
            nativeText,
            nativePages,
            'NATIVE_TEXT'
          ),
        };
      }

      /* ----------------------------- OCR -------------------------------- */

      const ocrPages =
        await extractScannedPdfTextWithOcr(
          buffer,
          language
        );

      const ocrText = ocrPages
        .map((page) => page.text)
        .join(' ');

      if (hasMeaningfulText(ocrText)) {
        return {
          method: 'OCR',
          text: normalizeWhitespace(ocrText),
          pages: ocrPages,
          language,
          fields: buildGenericFields(
            ocrText,
            ocrPages,  
            'OCR'
          ),
        };
      }

      return {
        method: 'NATIVE_TEXT_AND_OCR',
        text: '',
        pages: [],
        language,
        errorMessage:
          'No meaningful text was found using native PDF extraction or OCR.',
        fields: [],
      };
    } catch (error) {
      return {
        method: 'NATIVE_TEXT_AND_OCR',
        text: '',
        pages: [],
        language,
        errorMessage:
          `PDF extraction failed: ${
            error instanceof Error
              ? error.message
              : 'unknown error'
          }`,
        fields: [],
      };
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Images                                                                    */
  /* ------------------------------------------------------------------------ */

  if (
    isImageMimeType(mimeType) ||
    ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
  ) {
    try {
      const pages =
        await extractImageTextWithOcr(
          buffer,
          language
        );

      const text = pages
        .map((page) => page.text)
        .join(' ');

      if (!hasMeaningfulText(text)) {
        return {
          method: 'OCR',
          text: '',
          pages: [],
          language,
          errorMessage:
            'No readable text found in the uploaded image.',
          fields: [],
        };
      }

      return {
        method: 'OCR',
        text: normalizeWhitespace(text),
        pages,
        language,
        fields: buildGenericFields(
          text,
          pages,
          'OCR'
        ),
      };
    } catch (error) {
      return {
        method: 'OCR',
        text: '',
        pages: [],
        language,
        errorMessage:
          `Image OCR failed: ${
            error instanceof Error
              ? error.message
              : 'unknown error'
          }`,
        fields: [],
      };
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Unsupported                                                               */
  /* ------------------------------------------------------------------------ */

  return {
    method: 'NATIVE_TEXT',
    text: '',
    pages: [],
    language,
    errorMessage:
      `Unsupported document type: ${mimeType || ext}`,
    fields: [],
  };
}