/**
 * Image-to-Searchable-PDF converter.
 *
 * Strategy:
 *   1. HEIC/HEIF → convert to JPEG via ImageMagick (already in installer)
 *   2. JPEG/PNG/TIFF → Tesseract binary with `pdf` output type
 *      Tesseract generates a proper PDF/A: original image as background +
 *      invisible hOCR text layer → Ctrl+F / semantic search works natively.
 *
 * All processing is local and offline. No cloud calls.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, mkdir, unlink } from 'fs/promises';
import { extname, join, basename, dirname } from 'path';
import { tmpdir }  from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

export interface ConversionResult {
  pdfPath:    string;
  ocrText:    string;
  pageCount:  number;
  durationMs: number;
}

/** Detect OS-appropriate Tesseract binary name */
function tesseractBin(): string {
  return process.platform === 'win32' ? 'tesseract.exe' : 'tesseract';
}

/** ImageMagick binary (handles HEIC via libheif) */
function magickBin(): string {
  return process.platform === 'win32' ? 'magick.exe' : 'convert';
}

/**
 * Convert HEIC/HEIF to JPEG using ImageMagick.
 * Returns path to the temporary JPEG.
 */
async function heicToJpeg(heicPath: string): Promise<string> {
  const tmpPath = join(tmpdir(), `factum-il-${randomUUID()}.jpg`);
  await execFileAsync(magickBin(), [
    heicPath,
    '-quality', '95',
    '-density', '300',
    tmpPath,
  ], { timeout: 30_000 });
  return tmpPath;
}

/**
 * Run Tesseract with `pdf` output type to produce a searchable PDF.
 * Tesseract appends `.pdf` to the outputBase — we pass without extension.
 */
async function runTesseract(
  imagePath:  string,
  outputBase: string,
  langs = 'heb+eng',
): Promise<void> {
  await execFileAsync(tesseractBin(), [
    imagePath,
    outputBase,
    '-l', langs,
    '--dpi', '300',
    'pdf',
  ], { timeout: 120_000 });
}

/**
 * Run Tesseract in txt mode to extract plain OCR text.
 * Returns the raw text string.
 */
async function runTesseractText(
  imagePath: string,
  langs = 'heb+eng',
): Promise<string> {
  const tmpBase = join(tmpdir(), `factum-il-txt-${randomUUID()}`);
  try {
    await execFileAsync(tesseractBin(), [
      imagePath,
      tmpBase,
      '-l', langs,
      '--dpi', '300',
      'txt',
    ], { timeout: 120_000 });
    const { readFile } = await import('fs/promises');
    const text = await readFile(`${tmpBase}.txt`, 'utf-8');
    await unlink(`${tmpBase}.txt`).catch(() => undefined);
    return text.trim();
  } catch {
    await unlink(`${tmpBase}.txt`).catch(() => undefined);
    return '';
  }
}

/**
 * Convert an image file to a searchable PDF.
 *
 * @param imagePath  Absolute path to the source image (jpg/png/heic/tiff)
 * @param outputDir  Directory where the resulting PDF will be written
 * @param baseName   File name without extension for the output PDF
 * @returns          ConversionResult with the PDF path and OCR text
 */
export async function convertImageToPdf(
  imagePath:  string,
  outputDir:  string,
  baseName:   string,
): Promise<ConversionResult> {
  const start = Date.now();
  const ext   = extname(imagePath).toLowerCase();

  await mkdir(outputDir, { recursive: true });

  let workingImage = imagePath;
  let heicTmp: string | null = null;

  // HEIC/HEIF → JPEG first
  if (ext === '.heic' || ext === '.heif') {
    heicTmp    = await heicToJpeg(imagePath);
    workingImage = heicTmp;
  }

  const outputBase = join(outputDir, baseName);
  const pdfPath    = `${outputBase}.pdf`;

  try {
    // Run Tesseract → searchable PDF
    await runTesseract(workingImage, outputBase);

    // Also extract plain text for the database preview
    const ocrText = await runTesseractText(workingImage);

    return {
      pdfPath,
      ocrText,
      pageCount:  1,
      durationMs: Date.now() - start,
    };
  } finally {
    // Clean up HEIC temp file
    if (heicTmp) await unlink(heicTmp).catch(() => undefined);
  }
}

/** Check if Tesseract binary is available on PATH. */
export async function isTesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync(tesseractBin(), ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Check if ImageMagick is available (needed for HEIC). */
export async function isImageMagickAvailable(): Promise<boolean> {
  try {
    await execFileAsync(magickBin(), ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
