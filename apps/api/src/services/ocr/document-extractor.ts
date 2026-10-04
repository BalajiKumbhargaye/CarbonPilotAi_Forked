import path from 'path';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { IExtractionField } from '@carbonpilot/shared';

pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs');

export type ExtractionMethod = 'NATIVE_TEXT' | 'OCR' | 'NATIVE_TEXT_AND_OCR';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: 'NATIVE_TEXT' | 'OCR';
}

export interface DocumentExtractionPayload {
  method: ExtractionMethod;
  text: string;
  pages: ExtractedPage[];
  language: string;
  errorMessage?: string;
  fields: IExtractionField[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function hasMeaningfulText(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  if (normalized.length < 80) return /\b[a-zA-Z]{3,}\b/.test(normalized);
  return true;
}

function pageTextFromTokens(items: Array<{ str?: string }>): string {
  return items
    .map((item) => (typeof item.str === 'string' ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPdfNativeText(buffer: Buffer): Promise<ExtractedPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = pageTextFromTokens(textContent.items as Array<{ str?: string }>);
    if (text) {
      pages.push({ pageNumber, text, method: 'NATIVE_TEXT' });
    }
  }

  return pages;
}

async function renderPdfPageToPng(buffer: Buffer, pageNumber: number): Promise<Buffer> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  await page.render({ canvasContext: context as never, viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function runTesseractOnBuffer(buffer: Buffer, language: string): Promise<{ text: string; confidence?: number }> {
  const result = await Tesseract.recognize(buffer, language, {
    logger: () => undefined,
  });

  const text = normalizeWhitespace(result.data.text || '');
  const confidence = typeof result.data.confidence === 'number' ? Number(result.data.confidence) / 100 : undefined;
  return { text, confidence };
}

async function extractImageTextWithOcr(buffer: Buffer, language: string): Promise<ExtractedPage[]> {
  const result = await runTesseractOnBuffer(buffer, language);
  return result.text ? [{ pageNumber: 1, text: result.text, method: 'OCR' }] : [];
}

async function extractScannedPdfTextWithOcr(buffer: Buffer, language: string): Promise<ExtractedPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const imageBuffer = await renderPdfPageToPng(buffer, pageNumber);
    const result = await runTesseractOnBuffer(imageBuffer, language);
    if (result.text) {
      pages.push({ pageNumber, text: result.text, method: 'OCR' });
    }
  }

  return pages;
}

export function isImageMimeType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType.toLowerCase());
}

function buildGenericFields(text: string, pages: ExtractedPage[], method: ExtractionMethod): IExtractionField[] {
  const fields: IExtractionField[] = [];
  const allText = normalizeWhitespace(text);

  if (allText) {
    fields.push({
      field: 'DOCUMENT_TEXT',
      value: allText,
      sourceText: allText.slice(0, 250),
      page: 1,
      extractionStatus: 'EXTRACTED',
    });
  }

  for (const page of pages) {
    if (!page.text) continue;
    const safeText = normalizeWhitespace(page.text);
    fields.push({
      field: 'PAGE_TEXT',
      value: safeText,
      page: page.pageNumber,
      sourceText: safeText.slice(0, 250),
      extractionStatus: 'EXTRACTED',
    });
  }

  if (method === 'OCR' && pages.length > 0) {
    const sample = pages[0].text;
    const match = sample.match(/(?:\d+(?:[.,]\d+)?)\s*(kgCO2e\/kg|kgCO2e|tCO2e|kgCO2e\/unit|tCO2e\/t)/i);
    if (match) {
      fields.push({
        field: 'PCF_VALUE',
        value: Number(match[0].replace(/[^0-9.]/g, '')),
        unit: match[1],
        page: pages[0].pageNumber,
        sourceText: sample,
        extractionStatus: 'EXTRACTED',
      });
    }
  }

  return fields;
}

export async function extractDocumentTextFromBuffer(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  options: { language?: string } = {}
): Promise<DocumentExtractionPayload> {
  const language = options.language || process.env.OCR_LANGUAGE || 'eng';
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.pdf' || mimeType === 'application/pdf') {
    const nativePages = await extractPdfNativeText(buffer);
    const nativeText = nativePages.map((page) => page.text).join(' ');
    if (hasMeaningfulText(nativeText)) {
      return {
        method: 'NATIVE_TEXT',
        text: nativeText,
        pages: nativePages,
        language,
        fields: buildGenericFields(nativeText, nativePages, 'NATIVE_TEXT'),
      };
    }

    try {
      const pages = await extractScannedPdfTextWithOcr(buffer, language);
      const text = pages.map((page) => page.text).join(' ');
      if (text) {
        return {
          method: 'OCR',
          text,
          pages,
          language,
          fields: buildGenericFields(text, pages, 'OCR'),
        };
      }
    } catch (error) {
      return {
        method: 'OCR',
        text: '',
        pages: [],
        language,
        errorMessage: `PDF OCR failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        fields: [],
      };
    }

    return {
      method: 'NATIVE_TEXT',
      text: '',
      pages: [],
      language,
      errorMessage: 'No meaningful text found in the document and OCR did not produce readable output.',
      fields: [],
    };
  }

  if (isImageMimeType(mimeType) || ['.png', '.jpg', '.jpeg'].includes(ext)) {
    try {
      const pages = await extractImageTextWithOcr(buffer, language);
      const text = pages.map((page) => page.text).join(' ');
      if (!text) {
        return {
          method: 'OCR',
          text: '',
          pages: [],
          language,
          errorMessage: 'No readable text found in the uploaded image.',
          fields: [],
        };
      }
      return {
        method: 'OCR',
        text,
        pages,
        language,
        fields: buildGenericFields(text, pages, 'OCR'),
      };
    } catch (error) {
      return {
        method: 'OCR',
        text: '',
        pages: [],
        language,
        errorMessage: `Image OCR failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        fields: [],
      };
    }
  }

  return {
    method: 'NATIVE_TEXT',
    text: '',
    pages: [],
    language,
    errorMessage: 'Unsupported document type for extraction.',
    fields: [],
  };
}
