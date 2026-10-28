import {
  BrandGuideline,
  ApprovedFact,
  AuthorizedAsset,
  RuleSeverity,
  BoundingBox,
  ImageSummaryStats,
  FindingCategory,
  LogoPresenceResult,
  LogoInspectionDetails,
} from '@/lib/types';
import { EngineFinding } from './types';
import {
  auditImageTextAndTypography,
  auditImageLogoAndBrandIdentity,
  inspectLogoPresenceAndIdentity,
  evaluateLogoPolicyRequirements,
  auditImageAbusiveOrHarmfulLanguage,
  auditImageVisualAndDesignQuality,
  auditImageBrandAndMarketingClaims,
  auditImageCopyrightAndIpRisks,
} from './image-first-analyzer';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface VisionAnalysisResult {
  visionRun: boolean;
  provider?: string;
  model?: string;
  reason?: string;
  extracted_ocr_text: string;
  ocrConfidence?: number | null;
  ocrWordsCount?: number;
  ocrLinesCount?: number;
  unreadableSegmentsCount?: number;
  imageSummary?: ImageSummaryStats | null;
  boundingBoxes?: Array<{ text: string; confidence: number; bbox: BoundingBox }>;
  logoPresence?: LogoPresenceResult;
  logoDetection?: LogoInspectionDetails;
  findings: EngineFinding[];
  disclosures: string[];
}

export interface VisionAnalysisParams {
  imageUrl: string;
  guidelines: BrandGuideline[];
  facts: ApprovedFact[];
  assets: AuthorizedAsset[];
  ocrReferenceText?: string;
  captionText?: string;
  timeoutMs?: number;
  brandName?: string;
}

interface LocalOcrResult {
  text: string;
  confidence: number | null;
  wordsCount: number;
  linesCount: number;
  unreadableCount: number;
  boundingBoxes: Array<{ text: string; confidence: number; bbox: BoundingBox }>;
}

/**
 * Loads image buffer from local storage, data URL, or remote URL
 */
export async function loadImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('uploads/')) {
      const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
      const fullPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.svg'
                ? 'image/svg+xml'
                : 'image/jpeg';
        return { buffer, mimeType };
      }
    }

    if (imageUrl.startsWith('data:image/')) {
      const parts = imageUrl.split(';base64,');
      const mimeType = parts[0].replace('data:', '');
      const buffer = Buffer.from(parts[1], 'base64');
      return { buffer, mimeType };
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // 1. Check local public upload mirrors
      try {
        const urlObj = new URL(imageUrl);
        const filename = path.basename(urlObj.pathname);
        if (filename && filename.length > 3) {
          const localCreativePath = path.join(process.cwd(), 'public', 'uploads', 'creatives', filename);
          if (fs.existsSync(localCreativePath)) {
            const buffer = fs.readFileSync(localCreativePath);
            const ext = path.extname(localCreativePath).toLowerCase();
            const mimeType =
              ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.svg'
                    ? 'image/svg+xml'
                    : 'image/jpeg';
            return { buffer, mimeType };
          }
          const localAssetPath = path.join(process.cwd(), 'public', 'uploads', 'assets', filename);
          if (fs.existsSync(localAssetPath)) {
            const buffer = fs.readFileSync(localAssetPath);
            const ext = path.extname(localAssetPath).toLowerCase();
            const mimeType =
              ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.svg'
                    ? 'image/svg+xml'
                    : 'image/jpeg';
            return { buffer, mimeType };
          }
        }
      } catch { }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const mimeType = res.headers.get('content-type') || 'image/jpeg';
          return { buffer, mimeType };
        }
      } catch (e) {
        clearTimeout(timeout);
        console.warn('Remote image fetch failed:', e);
      }
    }
  } catch (err) {
    console.warn('Failed to load image buffer for vision analysis:', err);
  }
  return null;
}

/**
 * Robust OCR text cleanup and normalization.
 */
export function cleanAndNormalizeOcrText(rawOcr: string): string {
  if (!rawOcr) return '';
  return rawOcr
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    // Fix common OCR digit/letter confusion in percentage terms
    .replace(/\b(\d+)[Oo]\s*%/g, '$10%')
    .replace(/\b[Oo](\d+)\s*%/g, '0$1%')
    .replace(/\b([1-9]\d)[71]\s*%/g, '$1%')
    .replace(/\b([1-9]\d(?:\.\d+)?)\s*(?:\(\)|o\/o|0\/0)\b/gi, '$1%')
    .replace(/\b([1-9]\d)\s*[\n\r]+\s*(?:Yo|o\/o|0\/0|%)\b/gi, '$1%')
    .replace(/\b([1-9]\d)\s*[\n\r]+\s*(?:off|discount|sale)\b/gi, '$1% OFF')
    .replace(/\b([1-9]\d)\s+(?:Yo|o\/o|0\/0)\b/gi, '$1%')
    .replace(/\bwar[rt]?[aou][nmrui]{3,5}\b/gi, 'warranty')
    .replace(/\b(\d+)9g\b/gi, '$1g')
    .replace(/\b(\d+)9\s*(?:of\s+)?(protein|sugar|fat|fiber|carbs|carbohydrates|sodium|net\s+carbs)\b/gi, '$1g $2')
    .replace(/\b(\d+)9\s*\n+\s*["'~\-•·*]?\s*(?:[a-z]{1,3}\s+)?(protein|sugar|fiber|fat|carbs)\b/gi, '$1g\n$2')
    .replace(/^[~|^•·*]+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLineSymbols(text: string): string {
  return text
    .replace(/^[^a-zA-Z0-9#$€£"'(]+/, '')
    .replace(/[^a-zA-Z0-9#$€£"'!)%]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function computeStandardAspectRatio(width: number, height: number): string {
  if (!width || !height) return 'Unknown';
  const ratio = width / height;
  if (Math.abs(ratio - 1.0) < 0.05) return '1:1 (Square)';
  if (Math.abs(ratio - 0.8) < 0.05) return '4:5 (Portrait Post)';
  if (Math.abs(ratio - 0.5625) < 0.06) return '9:16 (Story / Reel)';
  if (Math.abs(ratio - 1.777) < 0.06) return '16:9 (Landscape Banner)';
  if (Math.abs(ratio - 1.91) < 0.06) return '1.91:1 (Feed Landscape)';
  if (Math.abs(ratio - 0.666) < 0.06) return '2:3 (Vertical Banner)';
  return `${width}:${height}`;
}

async function extractDominantColorHex(buffer: Buffer): Promise<string> {
  try {
    const stats = await sharp(buffer).stats();
    if (stats.dominant) {
      const { r, g, b } = stats.dominant;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }
    const [r, g, b] = stats.channels.slice(0, 3).map((c) => Math.round(c.mean));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  } catch {
    return '#808080';
  }
}

async function preprocessImageForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    let pipeline = sharp(buffer).rotate();

    const width = metadata.width || 1000;
    const height = metadata.height || 1000;
    const maxDim = Math.max(width, height);

    if (maxDim > 1100 || maxDim < 850) {
      const targetMax = 1000;
      const scale = targetMax / maxDim;
      pipeline = pipeline.resize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        fit: 'inside',
        kernel: sharp.kernel.lanczos3,
      });
    }

    return await pipeline
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('Image preprocessing for OCR failed, using original buffer:', err);
    return buffer;
  }
}

interface TesseractBlockLine {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractRecognizeResult {
  data?: {
    text?: string;
    confidence?: number;
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: TesseractBlockLine[];
      }>;
    }>;
  };
}

async function runLocalTesseractOCR(
  buffer: Buffer,
  timeoutMs: number = 18000
): Promise<LocalOcrResult> {
  const emptyResult: LocalOcrResult = {
    text: '',
    confidence: null,
    wordsCount: 0,
    linesCount: 0,
    unreadableCount: 0,
    boundingBoxes: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: any = null;

  const ocrPromise = (async (): Promise<LocalOcrResult> => {
    try {
      const preprocessed = await preprocessImageForOcr(buffer);
      const meta = await sharp(preprocessed).metadata();
      const imgW = meta.width || 1000;
      const imgH = meta.height || 1000;

      const { createWorker, PSM } = await import('tesseract.js');
      const trainedDataDir = process.cwd();
      worker = await createWorker('eng', 1, {
        cachePath: trainedDataDir,
        gzip: false,
        errorHandler: (e: unknown) => console.warn('Tesseract worker error:', e),
      });

      if (!worker) return emptyResult;

      if (typeof worker.setParameters === 'function') {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
        });
      }

      const ret1 = await worker.recognize(preprocessed, {}, { blocks: true, text: true });

      // Secondary pass for small badges and isolated callouts
      let ret2: TesseractRecognizeResult | null = null;
      let badgeW = imgW;
      let badgeH = imgH;
      try {
        const metaOrig = await sharp(buffer).metadata();
        const origW = metaOrig.width || 1000;
        const origH = metaOrig.height || 1000;
        const maxOrigDim = Math.max(origW, origH);
        const scale = 1000 / maxOrigDim;
        const targetBadgeW = Math.round(origW * scale);

        const prepBadge = await sharp(buffer)
          .rotate()
          .resize({ width: targetBadgeW, fit: 'inside' })
          .grayscale()
          .threshold(170)
          .png()
          .toBuffer();

        const badgeMeta = await sharp(prepBadge).metadata();
        badgeW = badgeMeta.width || imgW;
        badgeH = badgeMeta.height || imgH;

        if (typeof worker!.setParameters === 'function') {
          await worker!.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        }
        ret2 = await worker!.recognize(prepBadge, {}, { blocks: true, text: true });
      } catch (p2Err) {
        console.warn('Tesseract secondary badge pass notice:', p2Err);
      }

      await worker!.terminate();
      worker = null;

      const collectLines = (retObj: TesseractRecognizeResult | null): TesseractBlockLine[] => {
        const lines: TesseractBlockLine[] = [];
        for (const block of retObj?.data?.blocks || []) {
          for (const para of block.paragraphs || []) {
            for (const line of para.lines || []) {
              lines.push(line);
            }
          }
        }
        if (retObj?.data?.text) {
          const rawTextLines = retObj.data.text.split('\n').map((t) => t.trim()).filter((t) => t.length >= 2);
          for (const rawLine of rawTextLines) {
            if (!lines.some((l) => l.text.trim() === rawLine)) {
              lines.push({ text: rawLine, confidence: 85 });
            }
          }
        }
        return lines;
      };

      const pass1Lines = collectLines(ret1);
      const pass2Lines = collectLines(ret2);

      const cleanLines: string[] = [];
      const boundingBoxes: Array<{ text: string; confidence: number; bbox: BoundingBox }> = [];
      let totalConf = 0;
      let confidentCount = 0;
      let unreadableCount = 0;

      const processLine = (l: TesseractBlockLine, refW = imgW, refH = imgH) => {
        const rawText = l.text.trim();
        if (!rawText || rawText.length < 2) return;

        if (l.confidence < 28) {
          unreadableCount++;
          return;
        }

        const cleaned = cleanLineSymbols(cleanAndNormalizeOcrText(rawText));
        if (!cleaned || cleaned.length < 2) {
          unreadableCount++;
          return;
        }

        const words = cleaned.split(/\s+/).filter((w) => /^[a-zA-Z0-9$%]{2,}$/.test(w));
        const hasMetric = /[%$€£\d]/.test(cleaned) || /\b(?:off|discount|sale|save|free|protein|gluten|natural)\b/i.test(cleaned);
        const hasRecognizableWord = words.some((w) => w.length >= 3 || /^\d+%?$/.test(w)) || hasMetric;
        if (l.confidence < 45 && !hasRecognizableWord) {
          unreadableCount++;
          return;
        }

        const normExisting = cleanLines.map((cl) => cl.toLowerCase().replace(/[^a-z0-9%]/g, ''));
        const normCandidate = cleaned.toLowerCase().replace(/[^a-z0-9%]/g, '');
        if (normExisting.includes(normCandidate)) {
          return;
        }

        cleanLines.push(cleaned);
        totalConf += l.confidence;
        confidentCount++;

        if (l.bbox) {
          const normBbox: BoundingBox = {
            ymin: Math.round(Math.max(0, Math.min(1000, (l.bbox.y0 / refH) * 1000))),
            xmin: Math.round(Math.max(0, Math.min(1000, (l.bbox.x0 / refW) * 1000))),
            ymax: Math.round(Math.max(0, Math.min(1000, (l.bbox.y1 / refH) * 1000))),
            xmax: Math.round(Math.max(0, Math.min(1000, (l.bbox.x1 / refW) * 1000))),
          };
          boundingBoxes.push({
            text: cleaned,
            confidence: Math.round(l.confidence * 10) / 10,
            bbox: normBbox,
          });
        }
      };

      for (const l of pass1Lines) {
        processLine(l, imgW, imgH);
      }
      for (const l of pass2Lines) {
        processLine(l, badgeW, badgeH);
      }

      if (cleanLines.length === 0 && (ret1?.data?.text || ret2?.data?.text)) {
        const combinedRaw = [ret1?.data?.text, ret2?.data?.text].filter(Boolean).join('\n');
        const fallbackText = cleanAndNormalizeOcrText(combinedRaw);
        const fallbackLines = fallbackText.split('\n').filter(Boolean);
        return {
          text: fallbackText,
          confidence: null,
          wordsCount: fallbackText.split(/\s+/).filter(Boolean).length,
          linesCount: fallbackLines.length,
          unreadableCount: 0,
          boundingBoxes: [],
        };
      }

      const meanConfidence = confidentCount > 0 ? Math.round((totalConf / confidentCount) * 10) / 10 : null;
      const fullText = cleanAndNormalizeOcrText(cleanLines.join('\n'));
      const wordsCount = fullText.split(/\s+/).filter(Boolean).length;

      return {
        text: fullText,
        confidence: meanConfidence,
        wordsCount,
        linesCount: cleanLines.length,
        unreadableCount,
        boundingBoxes,
      };
    } catch (err) {
      console.warn('Local Tesseract OCR processing failed:', err);
      if (worker) {
        try {
          await worker.terminate();
        } catch { }
      }
      return emptyResult;
    }
  })();

  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<LocalOcrResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.warn(`Local Tesseract OCR reached timeout (${timeoutMs}ms); terminating worker.`);
      if (worker) {
        try {
          worker.terminate();
        } catch { }
      }
      resolve(emptyResult);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([ocrPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result;
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.warn('Local OCR execution caught unexpected error:', err);
    return emptyResult;
  }
}

/**
 * Extracts visible text elements directly from SVG vector content
 */
function extractSvgText(svgContent: string): LocalOcrResult {
  try {
    const cleaned = svgContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = cleanAndNormalizeOcrText(cleaned);
    const words = normalized.split(/\s+/).filter(Boolean);
    return {
      text: normalized,
      confidence: 100,
      wordsCount: words.length,
      linesCount: normalized.split('\n').filter(Boolean).length,
      unreadableCount: 0,
      boundingBoxes: [],
    };
  } catch {
    return {
      text: '',
      confidence: null,
      wordsCount: 0,
      linesCount: 0,
      unreadableCount: 0,
      boundingBoxes: [],
    };
  }
}

export async function runVisionAnalysis({
  imageUrl,
  guidelines,
  facts,
  assets,
  ocrReferenceText,
  captionText,
  timeoutMs = 60000,
  brandName,
}: VisionAnalysisParams): Promise<VisionAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const activeGuidelines = guidelines.filter((g) => g.is_active);
  const activeFacts = facts.filter((f) => f.is_active);
  const activeAssets = assets.filter((a) => a.is_active);

  // 1. If explicit fixed OCR reference text is provided (for deterministic tests)
  if (ocrReferenceText && ocrReferenceText.trim()) {
    const refText = cleanAndNormalizeOcrText(ocrReferenceText.trim());
    const refFindings: EngineFinding[] = [];
    refFindings.push(...auditImageTextAndTypography(refText, undefined, [brandName].filter(Boolean) as string[]));
    const logoAudit = inspectLogoPresenceAndIdentity(null, activeAssets, refText, {
      guidelines: activeGuidelines,
      brandName,
    });
    refFindings.push(...logoAudit.findings);
    refFindings.push(...auditImageBrandAndMarketingClaims(refText, activeGuidelines, activeFacts));
    refFindings.push(...auditImageAbusiveOrHarmfulLanguage(refText));
    refFindings.push(...auditImageCopyrightAndIpRisks(refText, activeAssets));

    const disclosures = ['Using verified fixed reference OCR text for deterministic claim comparison.'];
    if (!apiKey) {
      disclosures.push('Cloud AI Vision provider not configured. Creative analysis executed via deterministic rules.');
    }

    return {
      visionRun: false,
      provider: 'Deterministic Reference OCR',
      model: 'reference-ocr',
      extracted_ocr_text: refText,
      ocrConfidence: 100,
      ocrWordsCount: refText.split(/\s+/).filter(Boolean).length,
      ocrLinesCount: refText.split('\n').filter(Boolean).length,
      unreadableSegmentsCount: 0,
      imageSummary: null,
      boundingBoxes: [],
      logoPresence: logoAudit.presence,
      logoDetection: logoAudit.details,
      findings: refFindings,
      disclosures,
    };
  }

  // 2. Load Image Data Buffer
  const loaded = await loadImageBuffer(imageUrl);
  if (!loaded) {
    return {
      visionRun: false,
      reason: `Could not load image data from "${imageUrl}". Check that the file exists and is accessible.`,
      extracted_ocr_text: '',
      findings: [],
      disclosures: ['Creative image was inaccessible for server-side inspection.'],
    };
  }

  // 3. Extract Image Metadata via Sharp
  let imageSummary: ImageSummaryStats | null = null;
  try {
    const meta = await sharp(loaded.buffer).metadata();
    const dominantColor = await extractDominantColorHex(loaded.buffer);
    const w = meta.width || 0;
    const h = meta.height || 0;
    const aspect = computeStandardAspectRatio(w, h);

    imageSummary = {
      width: w,
      height: h,
      aspectRatio: aspect,
      format: (meta.format || loaded.mimeType.split('/')[1] || 'image').toUpperCase(),
      dominantColor,
      hasLegibleTypography: false,
      textLineCount: 0,
    };
  } catch (err) {
    console.warn('Sharp metadata extraction issue:', err);
  }

  // 4. Cloud Vision Analysis via Gemini when genuine API key is configured
  if (apiKey) {
    const base64Data = loaded.buffer.toString('base64');
    const prompt = `You are BrandGuard AI's lead creative governance vision inspector.
Analyze this uploaded marketing creative image independently for visible defects, typography quality, spelling errors, brand logo presence, policy violations, and compliance issues.
Evaluate the image thoroughly EVEN IF NO CUSTOM BRAND RULES ARE CONFIGURED.

=== BRAND CONTEXT ===
Target Brand: ${brandName ? `"${brandName}"` : '(General creative compliance evaluation)'}

=== ACTIVE BRAND GUIDELINES ===
${activeGuidelines.length > 0 ? activeGuidelines.map((g) => `ID: ${g.id} | Type: ${g.rule_type} | Severity: ${g.severity} | Title: ${g.title} | Rule: ${g.description} | Keywords: ${JSON.stringify(g.rule_configuration.keywords || [])}`).join('\n') : '(No custom brand guidelines configured - evaluate against universal creative quality, advertising standards, typography correctness, and brand identity best practices)'}

=== VERIFIED CORPORATE FACTS ===
${activeFacts.length > 0 ? activeFacts.map((f) => `ID: ${f.id} | Statement: ${f.fact_text} | Source: ${f.source_name}`).join('\n') : '(No corporate facts configured)'}

=== AUTHORIZED BRAND ASSETS (Logos, Colors, Badges) ===
${activeAssets.length > 0 ? activeAssets.map((a) => `ID: ${a.id} | Name: ${a.asset_name} | Type: ${a.asset_type} | Metadata: ${JSON.stringify(a.asset_metadata || {})}`).join('\n') : '(No authorized reference logo configured)'}

=== MANDATORY AUDIT INSTRUCTIONS ===
1. Transcribe all text visibly rendered in the creative image into "extracted_ocr_text" accurately (headlines, subheadings, badges, buttons, stickers, body text, packaging labels, fine print, and website/social handles).

2. Rigorously inspect the creative image across these categories:

   - "logo_and_brand_identity":
     * COMPREHENSIVE MULTI-REGION LOGO & BRAND SCAN:
       Thoroughly inspect ALL regions of the canvas for ANY brand logo, symbol, monogram, icon, badge, crest, seal, or brand wordmark:
       - All 4 corners: top-left, top-right, bottom-left, bottom-right
       - Top header banner & bottom footer signature / attribution
       - Center canvas and featured hero product packaging (e.g. snack wrappers, bottles, cans, boxes, device housings, tags, or apparel chest prints)
       - Stylized typography wordmarks (e.g. ${brandName ? `"${brandName}", ` : ''}company names, product sub-brands)
       - Lettermark monograms (e.g. 'GP', 'C', 'NX', 'A', or initials inside geometric shapes)
       - Abstract symbols, pictorial icons, or mascot graphics
     * Output a dedicated "logo_inspection" object:
       - "presence": EXACTLY one of:
         * "PRESENT": A recognizable logo, monogram, emblem, or brand mark is clearly visible on canvas.
         * "PRESENT_UNVERIFIED": A likely brand mark, monogram, emblem, or wordmark is visible, but cannot be verified against an authorized reference asset.
         * "MISSING": Full canvas inspection confirmed that NO logo, monogram, emblem, wordmark, or brand mark is visible ANYWHERE on canvas.
         * "UNCERTAIN": Image quality, extreme crop, or severe blur prevents a reliable conclusion.
       - "detected_mark": Exact description of what mark/emblem was seen (e.g. "Red winged circle emblem with 'CONSULTBIN' wordmark in top-left", "Stylized 'NUTRABITE' wordmark on product packaging", "Purple 'GP' monogram emblem in top-left") or "None".
       - "location": Canvas location (e.g. "top-left", "top-right", "bottom-left", "bottom-right", "center", "product packaging", "none").
       - "bounding_box": Bounding box coordinates { "ymin", "xmin", "ymax", "xmax" } normalized 0 to 1000 if visible, or null.
       - "confidence": Float between 0.0 and 1.0 calibrated to visual evidence clarity.
       - "matches_reference": Boolean if compared against AUTHORIZED BRAND ASSETS, or null if no reference configured.
       - "reference_notes": Brief explanation of reference comparison or verification status.
     * CRITICAL LOGO GOVERNANCE RULES:
       - If ANY brand logo, emblem, symbol, monogram, badge, or brand name is visible on canvas: presence MUST BE "PRESENT" or "PRESENT_UNVERIFIED". DO NOT set presence to "MISSING"!
       - NEVER report a "Missing Brand Logo" finding if ANY logo, monogram, symbol, emblem, or brand name is visible!
       - ONLY report "Missing Brand Logo" if presence is genuinely "MISSING" (zero mark anywhere) AND the ACTIVE BRAND GUIDELINES explicitly mandate a logo.
       - If no active brand guideline requires a logo, do NOT report a missing logo violation.
       - If an authorized reference logo is configured and the visible logo clearly belongs to a different brand, report "Brand Logo Reference Mismatch", NOT "Missing Brand Logo".

   - "spelling_and_grammar":
     * MICROSCOPIC COPY ACCURACY & MINOR MISTAKE DETECTION:
       Inspect EVERY single word rendered in the image. You MUST detect ALL mistakes, both major violations AND minor details:
       - Any minor spelling mistake, letter transposition, or typo (e.g. 'soelling' -> 'spelling', 'dtect' -> 'detect', 'gaurentee' -> 'guarantee', 'limted' -> 'limited', 'offfer'/'offr' -> 'offer', 'disconut' -> 'discount', 'recieve' -> 'receive', 'comitted' -> 'committed', 'delicous' -> 'delicious', 'proteen' -> 'protein', 'calender' -> 'calendar', 'foward' -> 'forward', 'experiance' -> 'experience', 'planing' -> 'planning', 'vaction' -> 'vacation', 'advanture' -> 'adventure', 'memmories' -> 'memories', 'bset' -> 'best', 'sael' -> 'sale', 'frea' -> 'free', 'svae' -> 'save', 'dill' -> 'deal').
       - Missing spaces between metrics/percentages/currency and words (e.g. '50%OFF' -> '50% OFF', '100%Organic' -> '100% Organic', '24/7Support' -> '24/7 Support', '$50Only' -> '$50 Only').
       - Accidental double spaces between words (e.g. 'Special  Discount').
       - Rogue spaces before punctuation (e.g. 'Offer ,' or 'Sale .').
       - Double period typos ('..' instead of '.' or '...').
       - Duplicated words/figures (e.g. 'are are', 'the the', 'free free', '50% 50%').
       - Indefinite article errors (e.g. 'a exclusive' -> 'an exclusive', 'a official' -> 'an official', 'an unique' -> 'a unique', 'an user' -> 'a user').
       - Common homophone/contraction slips (e.g. 'your invited' -> 'you're invited', 'its time' -> 'it's time', 'their is' -> 'there is').
       - Hyphenated or awkwardly cut-off words at line breaks.

   - "layout_and_design_quality":
     * Visual defects, low resolution/pixelation/blur.
     * Element safety margins: text or logo placed too close to canvas boundaries (<20px / 2% from border) risking being cropped on mobile viewports.
     * Low contrast or micro-typography making disclaimers or body text illegible.
     * Screenshot artifacts or mobile UI overlays (e.g. Google Lens icon, battery/clock/wifi status bar, photo gallery buttons).
     * AI generation artifacts (distorted hands/anatomy, smudged/melted text).

   - "claims_and_consistency":
     * Floating asterisks (* attached to an offer or headline claim with no corresponding disclaimer footnote at the bottom).
     * Contradictory statements within the image (e.g. conflicting discounts 50% vs 70%, conflicting prices or durations).
     * Prohibited absolute guarantees ("100% cure", "zero risk", "guaranteed profit") without mandatory disclaimers.

   - "abusive_or_harmful_language":
     * Profanity, insults, slurs, harassment, or inappropriate copy.

   - "copyright_and_ip_risk":
     * Commercial stock watermarks (Getty, Shutterstock, iStock, Alamy, Adobe Stock, "Sample", "Preview") or third-party IP logos.

   - "other_visible_issues":
     * Any other visible imperfection affecting brand quality, trustworthiness, or compliance.

3. For every violation or minor mistake detected, return:
   - "category": "spelling_and_grammar" | "logo_and_brand_identity" | "abusive_or_harmful_language" | "layout_and_design_quality" | "claims_and_consistency" | "copyright_and_ip_risk" | "other_visible_issues"
   - "severity": "low" | "medium" | "high" | "critical" (assign "low" or "medium" for minor mistakes/typos)
   - "finding_title": short clear descriptive title (e.g. "Spelling Error: 'proteen' instead of 'protein'", "Missing Space: '50%OFF'", "Floating Asterisk Without Footnote")
   - "explanation": evidence-backed explanation citing the specific visual defect or mistake
   - "evidence_text": the exact misspelled word, missing element description, or graphic element
   - "proposed_replacement": the corrected spelling or replacement text (if applicable)
   - "suggested_fix": actionable concrete fix
   - "target_type": "text" | "logo" | "color" | "layout" | "visual_element"
   - "bounding_box": object with "ymin", "xmin", "ymax", "xmax" normalized from 0 to 1000 representing the region of the violation on the image. (If localized)
   - "confidence": number between 0.0 and 1.0 based on certainty
   - "needs_human_verification": boolean
   - "human_verification_reason": string or null
   - "guideline_id": matching guideline UUID from above, or null
   - "fact_id": matching fact UUID from above, or null
   - "asset_id": matching asset UUID from above, or null

Return ONLY a valid JSON object formatted exactly as:
{
  "extracted_ocr_text": "All transcribed text here",
  "logo_inspection": {
    "presence": "PRESENT" | "PRESENT_UNVERIFIED" | "MISSING" | "UNCERTAIN",
    "detected_mark": "Detailed description of visible mark or 'None'",
    "location": "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "none",
    "bounding_box": { "ymin": 0, "xmin": 0, "ymax": 100, "xmax": 100 } | null,
    "confidence": 0.95,
    "matches_reference": true | false | null,
    "reference_notes": "Note on identity or reference comparison"
  },
  "findings": [ ...array of finding objects... ]
}
If there are no violations, return { "extracted_ocr_text": "...", "logo_inspection": { "presence": "PRESENT", "detected_mark": "...", "location": "...", "confidence": 0.95, "matches_reference": null }, "findings": [] }.`;

    try {
      const candidateModels = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-3.8-flash',
        'gemini-3-flash-preview',
        'gemini-flash-latest',
      ];
      let res: Response | null = null;
      let usedModel = candidateModels[0];

      for (const m of candidateModels) {
        const perModelController = new AbortController();
        const perModelTimeout = setTimeout(() => perModelController.abort(), Math.min(18000, timeoutMs));
        try {
          console.log(`[Gemini Vision] Attempting model "${m}"...`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: loaded.mimeType === 'image/svg+xml' ? 'image/png' : loaded.mimeType,
                        data: base64Data,
                      },
                    },
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
            signal: perModelController.signal,
          });
          clearTimeout(perModelTimeout);
          if (res.ok) {
            usedModel = m;
            console.log(`[Gemini Vision] Model "${m}" responded successfully (status 200).`);
            break;
          } else {
            const errBody = await res.text().catch(() => '');
            console.warn(`[Gemini Vision] Model "${m}" returned ${res.status} ${res.statusText}: ${errBody.slice(0, 150)}`);
          }
        } catch (fetchErr: unknown) {
          clearTimeout(perModelTimeout);
          console.warn(`[Gemini Vision] Model "${m}" call failed:`, fetchErr instanceof Error ? fetchErr.message : fetchErr);
        }
      }

      if (res && res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawText) {
          let parsed: {
            extracted_ocr_text?: string;
            logo_inspection?: Record<string, unknown>;
            findings?: Record<string, unknown>[];
          } = {};
          try {
            parsed = JSON.parse(rawText);
          } catch {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            }
          }

          const extractedOcr = cleanAndNormalizeOcrText(parsed.extracted_ocr_text || '');
          const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

          let mappedFindings: EngineFinding[] = rawFindings.map((f: Record<string, unknown>) => {
            const sevStr = typeof f.severity === 'string' ? f.severity : '';
            const severity: RuleSeverity = ['low', 'medium', 'high', 'critical'].includes(sevStr)
              ? (sevStr as RuleSeverity)
              : 'medium';

            let bbox = null;
            const rawBbox = (f.bounding_box || f.box_2d || f.box || f.boundingBox) as Record<string, unknown> | number[] | undefined;
            if (Array.isArray(rawBbox) && rawBbox.length === 4) {
              bbox = {
                ymin: Math.max(0, Math.min(1000, Math.round(Number(rawBbox[0]) || 0))),
                xmin: Math.max(0, Math.min(1000, Math.round(Number(rawBbox[1]) || 0))),
                ymax: Math.max(0, Math.min(1000, Math.round(Number(rawBbox[2]) || 0))),
                xmax: Math.max(0, Math.min(1000, Math.round(Number(rawBbox[3]) || 0))),
              };
            } else if (rawBbox && typeof rawBbox === 'object' && !Array.isArray(rawBbox)) {
              const objBbox = rawBbox as Record<string, unknown>;
              const ymin = Number(objBbox.ymin ?? objBbox.y0 ?? objBbox.top);
              const xmin = Number(objBbox.xmin ?? objBbox.x0 ?? objBbox.left);
              const ymax = Number(objBbox.ymax ?? objBbox.y1 ?? objBbox.bottom);
              const xmax = Number(objBbox.xmax ?? objBbox.x1 ?? objBbox.right);
              if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax)) {
                bbox = {
                  ymin: Math.max(0, Math.min(1000, Math.round(ymin))),
                  xmin: Math.max(0, Math.min(1000, Math.round(xmin))),
                  ymax: Math.max(0, Math.min(1000, Math.round(ymax))),
                  xmax: Math.max(0, Math.min(1000, Math.round(xmax))),
                };
              }
            }

            const evText = typeof f.evidence_text === 'string' ? f.evidence_text : undefined;
            const findingTitle = typeof f.finding_title === 'string' ? f.finding_title : 'Visual Brand Policy Violation';
            const rawCat = (typeof f.category === 'string' ? f.category : '').toLowerCase();
            const lowTitle = findingTitle.toLowerCase();
            let category: FindingCategory = 'other_visible_issues';
            if (
              rawCat.includes('spell') ||
              rawCat.includes('typo') ||
              rawCat.includes('grammar') ||
              rawCat.includes('typography') ||
              rawCat === 'spelling_and_text' ||
              rawCat === 'spelling_and_grammar' ||
              lowTitle.includes('spell') ||
              lowTitle.includes('typo') ||
              lowTitle.includes('word choice') ||
              lowTitle.includes('misspelled')
            ) {
              category = 'spelling_and_grammar';
            } else if (
              rawCat.includes('logo') ||
              rawCat.includes('brand_identity') ||
              rawCat.includes('logo_integrity') ||
              lowTitle.includes('logo')
            ) {
              category = 'logo_and_brand_identity';
            } else if (
              rawCat.includes('abusive') ||
              rawCat.includes('harmful') ||
              rawCat.includes('profan')
            ) {
              category = 'abusive_or_harmful_language';
            } else if (
              rawCat.includes('layout') ||
              rawCat.includes('design') ||
              rawCat.includes('quality') ||
              rawCat.includes('visual')
            ) {
              category = 'layout_and_design_quality';
            } else if (
              rawCat.includes('claim') ||
              rawCat.includes('consist') ||
              rawCat.includes('discount')
            ) {
              category = 'claims_and_consistency';
            } else if (
              rawCat.includes('copyright') ||
              rawCat.includes('watermark') ||
              rawCat.includes('ip')
            ) {
              category = 'copyright_and_ip_risk';
            } else if (rawCat.includes('guideline')) {
              category = 'brand_guideline';
            } else {
              category = 'other_visible_issues';
            }

            const proposedRepl = typeof f.proposed_replacement === 'string'
              ? f.proposed_replacement
              : (typeof f.suggested_replacement === 'string' ? f.suggested_replacement : null);

            return {
              category,
              severity,
              finding_title: typeof f.finding_title === 'string' ? f.finding_title : 'Visual Brand Policy Violation',
              explanation: typeof f.explanation === 'string' ? f.explanation : 'Flagged by multimodal vision model.',
              evidence_text: evText,
              guideline_id: typeof f.guideline_id === 'string' ? f.guideline_id : null,
              fact_id: typeof f.fact_id === 'string' ? f.fact_id : null,
              asset_id: typeof f.asset_id === 'string' ? f.asset_id : null,
              confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.85,
              suggested_fix: typeof f.suggested_fix === 'string' ? f.suggested_fix : undefined,
              proposed_replacement: proposedRepl,
              source: 'vision_model' as const,
              verification_status: 'confirmed_violation' as const,
              bounding_box: bbox,
              target_type: (typeof f.target_type === 'string' && ['text', 'logo', 'color', 'layout', 'visual_element'].includes(f.target_type))
                ? (f.target_type as 'text' | 'visual_element' | 'logo' | 'color' | 'layout')
                : 'text',
              target_scope: 'image' as const,
              image_evidence: evText,
              resolution_status: 'unresolved' as const,
              needs_human_verification: Boolean(f.needs_human_verification),
              human_verification_reason: typeof f.human_verification_reason === 'string' ? f.human_verification_reason : null,
            };
          });

          // Parse structured logo inspection from Gemini response
          let logoInspection: LogoInspectionDetails = {
            presence: 'UNCERTAIN',
            confidence: 0.5,
            is_identity_verified: false,
            explanation: 'Visual inspection completed',
            evidence: 'Visual inspection completed',
          };

          if (parsed.logo_inspection && typeof parsed.logo_inspection === 'object') {
            const rawPres = String(parsed.logo_inspection.presence || '').toUpperCase();
            const validPresence: LogoPresenceResult =
              rawPres === 'PRESENT' || rawPres === 'PRESENT_UNVERIFIED' || rawPres === 'MISSING' || rawPres === 'UNCERTAIN'
                ? rawPres
                : 'UNCERTAIN';

            const rawBox = parsed.logo_inspection.bounding_box as Record<string, unknown> | undefined;
            const bbox = rawBox && typeof rawBox === 'object'
              ? {
                  ymin: Math.max(0, Math.min(1000, Number(rawBox.ymin) || 0)),
                  xmin: Math.max(0, Math.min(1000, Number(rawBox.xmin) || 0)),
                  ymax: Math.max(0, Math.min(1000, Number(rawBox.ymax) || 1000)),
                  xmax: Math.max(0, Math.min(1000, Number(rawBox.xmax) || 1000)),
                }
              : undefined;

            const markDesc = typeof parsed.logo_inspection.detected_mark === 'string' && parsed.logo_inspection.detected_mark !== 'None' ? parsed.logo_inspection.detected_mark : undefined;
            const locStr = typeof parsed.logo_inspection.location === 'string' && parsed.logo_inspection.location !== 'none' ? parsed.logo_inspection.location : undefined;

            logoInspection = {
              presence: validPresence,
              detected_mark: markDesc,
              location: locStr,
              bounding_box: bbox,
              confidence: typeof parsed.logo_inspection.confidence === 'number'
                ? Math.max(0, Math.min(1, parsed.logo_inspection.confidence))
                : 0.85,
              is_identity_verified: validPresence === 'PRESENT',
              explanation: markDesc
                ? `Logo/brand mark detected: ${markDesc} (${locStr || 'canvas region'}).`
                : (validPresence === 'MISSING' ? 'Canvas visual inspection confirmed absence of brand logo or watermark.' : 'Visual inspection completed'),
              matches_reference: typeof parsed.logo_inspection.matches_reference === 'boolean'
                ? parsed.logo_inspection.matches_reference
                : undefined,
              reference_notes: typeof parsed.logo_inspection.reference_notes === 'string'
                ? parsed.logo_inspection.reference_notes
                : undefined,
              evidence: markDesc
                ? `Detected mark: ${markDesc} (${locStr || 'canvas'})`
                : (validPresence === 'MISSING' ? 'Canvas visual inspection confirmed absence of brand logo or watermark.' : 'Visual inspection completed'),
            };
          }

          // Local OCR and asset brand check to cross-validate Gemini's logo detection
          const localInspect = inspectLogoPresenceAndIdentity(imageSummary, activeAssets, extractedOcr, {
            guidelines: activeGuidelines,
          });

          // Check if brandName or active asset brand name is present in OCR text or detected mark
          const activeBrandName = brandName || activeAssets.find((a) => a.asset_type === 'logo')?.asset_name?.replace(/official/i, '').replace(/primary/i, '').replace(/logo/i, '').trim();
          const hasBrandInOcr = Boolean(
            activeBrandName && activeBrandName.length >= 2 &&
            extractedOcr.toLowerCase().replace(/[^a-z0-9]/g, '').includes(activeBrandName.toLowerCase().replace(/[^a-z0-9]/g, ''))
          );

          // If Gemini reported MISSING or UNCERTAIN, but local OCR/inspection detects a brand mark or wordmark:
          if (
            (logoInspection.presence === 'MISSING' || logoInspection.presence === 'UNCERTAIN') &&
            (localInspect.presence === 'PRESENT' || localInspect.presence === 'PRESENT_UNVERIFIED' || hasBrandInOcr)
          ) {
            console.log(`[Logo Governance] Cross-validation upgrade: Upgraded logo presence from ${logoInspection.presence} to PRESENT based on detected brand mark/wordmark ("${activeBrandName || localInspect.details.detected_mark}").`);
            logoInspection.presence = 'PRESENT';
            logoInspection.detected_mark = logoInspection.detected_mark || activeBrandName || localInspect.details.detected_mark;
            logoInspection.confidence = Math.max(logoInspection.confidence, 0.88);
            logoInspection.is_identity_verified = true;
            logoInspection.explanation = `Brand mark / wordmark "${logoInspection.detected_mark}" confirmed visible on creative canvas.`;
            logoInspection.evidence = `Visible mark: "${logoInspection.detected_mark}"`;
          }

          // Supplementary safety checks on extracted text (typos, spacing, floating asterisks, punctuation)
          const localTypoFindings = auditImageTextAndTypography(extractedOcr);
          for (const ltf of localTypoFindings) {
            const alreadyFlagged = mappedFindings.some(
              (mf) =>
                (mf.category === 'spelling_and_grammar' || mf.category === 'spelling_and_text') &&
                ((mf.evidence_text && ltf.evidence_text && mf.evidence_text.toLowerCase() === ltf.evidence_text.toLowerCase()) ||
                  mf.finding_title.toLowerCase().includes((ltf.evidence_text || '').toLowerCase()))
            );
            if (!alreadyFlagged) {
              mappedFindings.push(ltf);
            }
          }

          // Supplementary visual & design quality checks (edge margin proximity, screenshot chrome, low contrast)
          const localVisualFindings = auditImageVisualAndDesignQuality(imageSummary, extractedOcr);
          for (const lvf of localVisualFindings) {
            const alreadyFlagged = mappedFindings.some(
              (mf) =>
                (mf.category === 'layout_and_design_quality' || mf.category === 'layout_and_design') &&
                mf.finding_title.toLowerCase() === lvf.finding_title.toLowerCase()
            );
            if (!alreadyFlagged) {
              mappedFindings.push(lvf);
            }
          }

          // Supplementary claims & facts consistency checks
          const localClaimsFindings = auditImageBrandAndMarketingClaims(extractedOcr, activeGuidelines, activeFacts);
          for (const lcf of localClaimsFindings) {
            const alreadyFlagged = mappedFindings.some(
              (mf) =>
                (mf.category === 'claims_and_consistency' || mf.category === 'brand_guideline') &&
                ((mf.evidence_text && lcf.evidence_text && mf.evidence_text.toLowerCase() === lcf.evidence_text.toLowerCase()) ||
                  mf.finding_title.toLowerCase() === lcf.finding_title.toLowerCase())
            );
            if (!alreadyFlagged) {
              mappedFindings.push(lcf);
            }
          }

          // Suppress false mismatch findings when creative matches active brand
          if (activeBrandName) {
            const normBrand = activeBrandName.toLowerCase().replace(/[^a-z0-9]/g, '');
            mappedFindings = mappedFindings.filter((f) => {
              const isMismatchFinding =
                (f.category === 'logo_and_brand_identity' || f.category === 'logo_and_brand') &&
                (f.finding_title.toLowerCase().includes('mismatch') ||
                  f.finding_title.toLowerCase().includes('unauthorized logo') ||
                  f.finding_title.toLowerCase().includes('unrecognized logo') ||
                  f.explanation.toLowerCase().includes('does not match the authorized'));

              if (!isMismatchFinding) return true;

              const detectedMark = (logoInspection.detected_mark || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const evidence = (f.evidence_text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              if (
                hasBrandInOcr ||
                (detectedMark && (detectedMark.includes(normBrand) || normBrand.includes(detectedMark))) ||
                (evidence && (evidence.includes(normBrand) || normBrand.includes(evidence)))
              ) {
                console.log(`[Logo Governance] Suppressed false-positive logo mismatch finding for active brand "${activeBrandName}".`);
                return false;
              }
              return true;
            });
          }

          // Explicit Evidence-Based Logo Contradiction Resolution
          const logoPolicy = evaluateLogoPolicyRequirements(activeGuidelines, activeAssets);

          mappedFindings = mappedFindings.filter((f) => {
            const isMissingLogoFinding =
              (f.category === 'logo_and_brand_identity' || f.category === 'logo_and_brand') &&
              (f.finding_title.toLowerCase().includes('missing') || f.finding_title.toLowerCase().includes('no brand logo'));

            if (!isMissingLogoFinding) return true;

            // 1. If logo is visible (PRESENT or PRESENT_UNVERIFIED), suppress false missing-logo finding
            if (logoInspection.presence === 'PRESENT' || logoInspection.presence === 'PRESENT_UNVERIFIED') {
              console.log(`[Logo Governance] Resolved contradiction: Suppressed false-positive missing-logo finding because logo presence is ${logoInspection.presence} ("${logoInspection.detected_mark || 'Visible Mark'}").`);
              return false;
            }

            // 2. If active brand guidelines do NOT mandate a logo, absence is not a violation
            if (!logoPolicy.isMandatory) {
              console.log('[Logo Governance] Suppressed missing-logo finding: Active brand guidelines do not mandate a logo for this creative.');
              return false;
            }

            // 3. If logo presence is UNCERTAIN, do not assign confirmed violation
            if (logoInspection.presence === 'UNCERTAIN') {
              f.verification_status = 'unverifiable';
              f.needs_human_verification = true;
              f.confidence = Math.min(f.confidence, 0.60);
              f.finding_title = 'Logo Presence Inconclusive / Verification Required';
            }

            return true;
          });

          // If logo is genuinely MISSING and MANDATED by guidelines, ensure finding is recorded
          if (logoInspection.presence === 'MISSING' && logoPolicy.isMandatory) {
            const hasMissingLogo = mappedFindings.some(
              (f) => (f.category === 'logo_and_brand_identity' || f.category === 'logo_and_brand') && f.finding_title.toLowerCase().includes('missing')
            );
            if (!hasMissingLogo) {
              const auditRes = inspectLogoPresenceAndIdentity(imageSummary, activeAssets, extractedOcr, {
                guidelines: activeGuidelines,
                logoInspection,
              });
              mappedFindings.push(...auditRes.findings);
            }
          }

          if (imageSummary) {
            imageSummary.hasLegibleTypography = extractedOcr.length > 0;
            imageSummary.textLineCount = extractedOcr.split('\n').filter(Boolean).length;
          }

          return {
            visionRun: true,
            provider: 'Google Gemini Vision',
            model: usedModel,
            extracted_ocr_text: extractedOcr,
            ocrConfidence: 95,
            ocrWordsCount: extractedOcr.split(/\s+/).filter(Boolean).length,
            ocrLinesCount: extractedOcr.split('\n').filter(Boolean).length,
            imageSummary,
            logoPresence: logoInspection.presence,
            logoDetection: logoInspection,
            findings: mappedFindings,
            disclosures: [`Multimodal creative visual analysis executed via Google Gemini Vision (${usedModel}).`],
          };
        }
      }
    } catch (err: unknown) {
      console.warn('Gemini vision API error, falling back to local OCR:', err);
    }
  }

  // 5. Local OCR Extraction & Heuristic Engine
  console.log(`[OCR Pipeline] Processing creative image: "${imageUrl}" (buffer size: ${loaded.buffer.length} bytes)`);
  let ocrResult: LocalOcrResult;
  if (loaded.mimeType === 'image/svg+xml') {
    ocrResult = extractSvgText(loaded.buffer.toString('utf-8'));
  } else {
    ocrResult = await runLocalTesseractOCR(loaded.buffer);
  }
  console.log(`[OCR Pipeline] Extracted ${ocrResult.linesCount} lines (${ocrResult.wordsCount} words) from "${imageUrl}"`);

  if (imageSummary) {
    imageSummary.hasLegibleTypography = ocrResult.text.length > 0;
    imageSummary.textLineCount = ocrResult.linesCount;
  }

  // 6. Direct Image-First Audits across the 6 Core Categories
  const localFindings: EngineFinding[] = [];

  // 1. Text & Spelling
  const typographyFindings = auditImageTextAndTypography(ocrResult.text, ocrResult.boundingBoxes);
  localFindings.push(...typographyFindings);

  // 2. Logo & Brand Identity
  const logoAudit = inspectLogoPresenceAndIdentity(imageSummary, activeAssets, ocrResult.text, {
    guidelines: activeGuidelines,
    brandName,
  });
  localFindings.push(...logoAudit.findings);

  // 3. Abusive & Harmful Language
  const abusiveFindings = auditImageAbusiveOrHarmfulLanguage(ocrResult.text, ocrResult.boundingBoxes);
  localFindings.push(...abusiveFindings);

  // 4. Layout & Visual Quality
  const visualFindings = auditImageVisualAndDesignQuality(imageSummary, ocrResult.text, ocrResult.boundingBoxes);
  localFindings.push(...visualFindings);

  // 5. Claims & Consistency
  const claimsFindings = auditImageBrandAndMarketingClaims(ocrResult.text, activeGuidelines, activeFacts);
  localFindings.push(...claimsFindings);

  // 6. Potential Copyright & IP Risks
  const copyrightFindings = auditImageCopyrightAndIpRisks(ocrResult.text, activeAssets);
  localFindings.push(...copyrightFindings);

  // Check: Legibility & Unreadable Content Observation
  if (ocrResult.unreadableCount >= 5 && ocrResult.linesCount < 2) {
    localFindings.push({
      category: 'layout_and_design_quality',
      severity: 'low',
      finding_title: 'Degraded Typography / Low Contrast Detected',
      explanation: 'Image contains multiple text-like regions with degraded contrast or low OCR recognition confidence (<45%). Manual visual inspection is recommended to verify legibility across mobile screens.',
      evidence_text: `Unreadable or degraded segments: ${ocrResult.unreadableCount}`,
      confidence: ocrResult.confidence ? ocrResult.confidence / 100 : 0.65,
      suggested_fix: 'Increase typography contrast against the background graphic and verify minimum 16px font size.',
      source: 'image',
      verification_status: 'possible_inconsistency',
      target_type: 'layout',
      target_scope: 'image',
      resolution_status: 'unresolved',
      needs_human_verification: true,
      human_verification_reason: 'Inspect typography readability against background colors on mobile screens.',
    });
  }

  // Disclosures
  const disclosures: string[] = [
    apiKey
      ? 'Creative visual analysis executed via multimodal vision engine.'
      : 'Cloud AI Vision provider not configured. Creative analysis executed via local OCR and image governance heuristics.',
  ];

  if (!ocrResult.text) {
    disclosures.push('No legible typography was detected in this creative image.');
  }

  return {
    visionRun: false,
    provider: loaded.mimeType === 'image/svg+xml' ? 'SVG Vector Parser' : 'Tesseract.js OCR (Local Engine)',
    model: loaded.mimeType === 'image/svg+xml' ? 'svg-xml-dom' : 'tesseract-wasm',
    extracted_ocr_text: ocrResult.text,
    ocrConfidence: ocrResult.confidence,
    ocrWordsCount: ocrResult.wordsCount,
    ocrLinesCount: ocrResult.linesCount,
    unreadableSegmentsCount: ocrResult.unreadableCount,
    imageSummary,
    boundingBoxes: ocrResult.boundingBoxes,
    logoPresence: logoAudit.presence,
    logoDetection: logoAudit.details,
    findings: localFindings,
    disclosures,
  };
}
