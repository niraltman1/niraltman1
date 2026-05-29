import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const exec = promisify(execFile);

export interface PreprocessOptions {
  targetDPI?:          number;   // default 300
  binarize?:           boolean;  // default true
  denoise?:            boolean;  // default true
  normalizeContrast?:  boolean;  // default true
  deskew?:             boolean;  // default true
}

export interface PreprocessResult {
  outputPath:  string;
  appliedOps:  string[];
  skewAngle?:  number;
  durationMs:  number;
}

const CONVERT_BIN = process.platform === 'win32' ? 'magick' : 'convert';
const GS_BIN      = process.platform === 'win32' ? 'gswin64c' : 'gs';

export class OCRPreprocessor {
  // ───────────────────────────────────────────────
  //  Full pipeline
  // ───────────────────────────────────────────────

  async pipeline(inputPath: string, outputDir: string, opts: PreprocessOptions = {}): Promise<PreprocessResult> {
    const t0 = Date.now();
    if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

    const options = {
      targetDPI:         opts.targetDPI         ?? 300,
      binarize:          opts.binarize          ?? true,
      denoise:           opts.denoise           ?? true,
      normalizeContrast: opts.normalizeContrast ?? true,
      deskew:            opts.deskew            ?? true,
    };

    const stem = basename(inputPath, extname(inputPath));
    let   current  = inputPath;
    const applied: string[] = [];
    let   skewAngle: number | undefined;

    // 1. DPI normalisation (for non-300 DPI images)
    const normalised = join(outputDir, `${stem}_norm.png`);
    await this.normalizeDPI(current, normalised, options.targetDPI);
    current = normalised;
    applied.push('dpi_normalize');

    // 2. Contrast normalisation
    if (options.normalizeContrast) {
      const contrasted = join(outputDir, `${stem}_contrast.png`);
      await this.normalizeContrast(current, contrasted);
      current = contrasted;
      applied.push('contrast_normalize');
    }

    // 3. Denoise
    if (options.denoise) {
      const denoised = join(outputDir, `${stem}_denoised.png`);
      await this.denoise(current, denoised);
      current = denoised;
      applied.push('denoise');
    }

    // 4. Binarization
    if (options.binarize) {
      const binarized = join(outputDir, `${stem}_bin.png`);
      await this.binarize(current, binarized);
      current = binarized;
      applied.push('binarize');
    }

    // 5. Deskew (detect and correct skew)
    if (options.deskew) {
      const { angle, outputPath: deskewed } = await this.deskew(current, outputDir);
      skewAngle = angle;
      if (Math.abs(angle) > 0.3) {
        current = deskewed;
        applied.push(`deskew(${angle.toFixed(1)}°)`);
      }
    }

    return {
      outputPath: current,
      appliedOps: applied,
      ...(skewAngle !== undefined ? { skewAngle } : {}),
      durationMs: Date.now() - t0,
    };
  }

  // ───────────────────────────────────────────────
  //  Individual operations
  // ───────────────────────────────────────────────

  async normalizeDPI(inputPath: string, outputPath: string, dpi = 300): Promise<void> {
    // Ghostscript: rasterise at target DPI to grayscale PNG
    await exec(GS_BIN, [
      '-dBATCH', '-dNOPAUSE', '-dSAFER', '-dQUIET',
      '-sDEVICE=pnggray',
      `-r${dpi}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);
  }

  async normalizeContrast(inputPath: string, outputPath: string): Promise<void> {
    // ImageMagick: normalize histogram + auto-level
    await exec(CONVERT_BIN, [
      inputPath,
      '-normalize',
      '-level', '10%,90%',
      outputPath,
    ]);
  }

  async denoise(inputPath: string, outputPath: string): Promise<void> {
    // ImageMagick: despeckle twice + median filter for Hebrew letter integrity
    await exec(CONVERT_BIN, [
      inputPath,
      '-despeckle', '-despeckle',
      '-median', '1',
      outputPath,
    ]);
  }

  async binarize(inputPath: string, outputPath: string, threshold = '50%'): Promise<void> {
    // Otsu-style adaptive binarization via ImageMagick
    await exec(CONVERT_BIN, [
      inputPath,
      '-colorspace', 'Gray',
      '-auto-threshold', 'OTSU',
      '-threshold', threshold,
      '-type', 'Bilevel',
      outputPath,
    ]);
  }

  async deskew(inputPath: string, outputDir: string): Promise<{ angle: number; outputPath: string }> {
    // ImageMagick -deskew detects and corrects the skew angle
    const outputPath = join(outputDir, `${basename(inputPath, extname(inputPath))}_deskewed.png`);

    let stdout = '';
    try {
      const result = await exec(CONVERT_BIN, [
        inputPath,
        '-deskew', '40%',
        '-verbose',
        outputPath,
      ]);
      stdout = result.stderr ?? '';
    } catch (e: unknown) {
      stdout = (e as { stderr?: string }).stderr ?? '';
    }

    const match = stdout.match(/deskew:?\s*(-?\d+\.?\d*)/i);
    const angle = match ? parseFloat(match[1]!) : 0;
    return { angle, outputPath };
  }

  // ───────────────────────────────────────────────
  //  Quality assessment
  // ───────────────────────────────────────────────

  async assessQuality(imagePath: string): Promise<{
    meanSignalStrength: number;
    estimatedDPI:       number;
    isMonochrome:       boolean;
  }> {
    try {
      const { stdout } = await exec(CONVERT_BIN, [
        imagePath,
        '-format', '%[fx:mean]|%[fx:w]|%[colorspace]',
        'info:',
      ]);
      const [meanStr = '0', , cs = ''] = stdout.trim().split('|');
      return {
        meanSignalStrength: 1 - parseFloat(meanStr),  // darker = more content
        estimatedDPI:       this.estimateDPI(imagePath),
        isMonochrome:       cs.toLowerCase().includes('gray') || cs.toLowerCase().includes('mono'),
      };
    } catch {
      return { meanSignalStrength: 0, estimatedDPI: 0, isMonochrome: false };
    }
  }

  private estimateDPI(imagePath: string): number {
    try {
      const stat = statSync(imagePath);
      // Heuristic: A4 at 300 DPI ≈ 2.5 MB for grayscale PNG
      const MB = stat.size / (1024 * 1024);
      return MB > 1.5 ? 300 : MB > 0.4 ? 150 : 72;
    } catch {
      return 0;
    }
  }
}
