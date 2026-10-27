import { BrandGuideline, ApprovedFact, AuthorizedAsset, RuleSeverity, BoundingBox, ImageSummaryStats, FindingCategory } from '@/lib/types';
import { EngineFinding } from './types';
import {
  auditImageTextAndTypography,
  auditImageLogoAndBrandIdentity,
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
  timeoutMs = 15000,
}: VisionAnalysisParams): Promise<VisionAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const activeGuidelines = guidelines.filter((g) => g.is_active);
  const activeFacts = facts.filter((f) => f.is_active);
  const activeAssets = assets.filter((a) => a.is_active);

  // 1. If explicit fixed OCR reference text is provided (for deterministic tests)
  if (ocrReferenceText && ocrReferenceText.trim()) {
    const refText = cleanAndNormalizeOcrText(ocrReferenceText.trim());
    const refFindings: EngineFinding[] = [];
    refFindings.push(...auditImageTextAndTypography(refText));
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
Analyze this uploaded marketing creative image independently for visible defects, typography quality, brand policy violations, and compliance issues.

=== ACTIVE BRAND GUIDELINES ===
${activeGuidelines.length > 0 ? activeGuidelines.map((g) => `ID: ${g.id} | Type: ${g.rule_type} | Severity: ${g.severity} | Title: ${g.title} | Rule: ${g.description} | Keywords: ${JSON.stringify(g.rule_configuration.keywords || [])}`).join('\n') : '(No custom brand guidelines configured - evaluate against general creative quality and advertising standards)'}

=== VERIFIED CORPORATE FACTS ===
${activeFacts.length > 0 ? activeFacts.map((f) => `ID: ${f.id} | Statement: ${f.fact_text} | Source: ${f.source_name}`).join('\n') : '(No corporate facts configured)'}

=== AUTHORIZED BRAND ASSETS (Logos, Colors, Badges) ===
${activeAssets.length > 0 ? activeAssets.map((a) => `ID: ${a.id} | Name: ${a.asset_name} | Type: ${a.asset_type} | Metadata: ${JSON.stringify(a.asset_metadata || {})}`).join('\n') : '(No authorized reference logo configured)'}

=== AUDIT INSTRUCTIONS ===
1. Transcribe all text visibly rendered in the creative image into "extracted_ocr_text" accurately.
2. Inspect the creative image across these 7 categories:
   - "spelling_and_text": Likely spelling mistakes, typos, duplicated words/figures, malformed words, broken words, or cut-off text.
   - "logo_and_brand_identity": Logo distortion, stretching, improper cropping, blur, poor contrast, or deviation from configured authorized logo reference. If no official logo is configured, state that official-brand consistency could not be verified.
   - "abusive_or_harmful_language": Profanity, insults, slurs, harassment, threats, or inappropriate copy in visible text.
   - "layout_and_design_quality": Text clipping, cut-off elements, overlapping content, broken alignment, inconsistent spacing, unreadable font sizes, low contrast, blur, compression artifacts, or obscured disclaimers.
   - "claims_and_consistency": Contradictory statements within the image (conflicting prices, conflicting discounts, conflicting durations or specs), suspicious absolute guarantees ("100% cure", "zero risk"), or contradictions with active brand guidelines and verified corporate facts.
   - "copyright_and_ip_risk": Commercial stock watermarks (Getty, Shutterstock, etc.) or recognizable third-party logos/characters. Explain visible evidence and recommend human review. Do not claim legal infringement from pixels alone.
   - "other_visible_issues": Other meaningful issues affecting professionalism, trust, or accessibility. Avoid generic nitpicking.

3. For every genuine violation detected, return:
   - "category": "spelling_and_text" | "logo_and_brand_identity" | "abusive_or_harmful_language" | "layout_and_design_quality" | "claims_and_consistency" | "copyright_and_ip_risk" | "other_visible_issues"
   - "severity": "low" | "medium" | "high" | "critical"
   - "finding_title": short clear title
   - "explanation": evidence-backed explanation citing the specific visual defect, rule, or claim
   - "evidence_text": the exact text from the image or description of the visual element
   - "target_type": "text" | "logo" | "color" | "layout" | "visual_element"
   - "bounding_box": object with "ymin", "xmin", "ymax", "xmax" normalized from 0 to 1000 representing the region of the violation on the image. ONLY provide bounding boxes where detection is genuinely localized.
   - "suggested_fix": actionable concrete fix
   - "confidence": number between 0.0 and 1.0 based on certainty
   - "needs_human_verification": boolean
   - "human_verification_reason": string or null
   - "guideline_id": matching guideline UUID from above, or null
   - "fact_id": matching fact UUID from above, or null
   - "asset_id": matching asset UUID from above, or null

Return ONLY a valid JSON object formatted exactly as:
{
  "extracted_ocr_text": "All transcribed text here",
  "findings": [ ...array of finding objects... ]
}
If there are no violations, return { "extracted_ocr_text": "...", "findings": [] }.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let res: Response | null = null;
      let usedModel = candidateModels[0];

      for (const m of candidateModels) {
        try {
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
            signal: controller.signal,
          });
          if (res.ok) {
            usedModel = m;
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawText) {
          let parsed: { extracted_ocr_text?: string; findings?: Record<string, unknown>[] } = {};
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

          const mappedFindings: EngineFinding[] = rawFindings.map((f: Record<string, unknown>) => {
            const sevStr = typeof f.severity === 'string' ? f.severity : '';
            const severity: RuleSeverity = ['low', 'medium', 'high', 'critical'].includes(sevStr)
              ? (sevStr as RuleSeverity)
              : 'medium';

            let bbox = null;
            const rawBbox = f.bounding_box as { ymin?: unknown; xmin?: unknown; ymax?: unknown; xmax?: unknown } | undefined;
            if (
              rawBbox &&
              typeof rawBbox.ymin === 'number' &&
              typeof rawBbox.xmin === 'number' &&
              typeof rawBbox.ymax === 'number' &&
              typeof rawBbox.xmax === 'number'
            ) {
              bbox = {
                ymin: Math.max(0, Math.min(1000, rawBbox.ymin)),
                xmin: Math.max(0, Math.min(1000, rawBbox.xmin)),
                ymax: Math.max(0, Math.min(1000, rawBbox.ymax)),
                xmax: Math.max(0, Math.min(1000, rawBbox.xmax)),
              };
            }

            const evText = typeof f.evidence_text === 'string' ? f.evidence_text : undefined;
            const validCategories: FindingCategory[] = [
              'spelling_and_text',
              'logo_and_brand_identity',
              'abusive_or_harmful_language',
              'layout_and_design_quality',
              'claims_and_consistency',
              'copyright_and_ip_risk',
              'other_visible_issues',
              'brand_guideline',
            ];
            const rawCat = typeof f.category === 'string' ? f.category : 'brand_guideline';
            const category: FindingCategory = validCategories.includes(rawCat)
              ? rawCat
              : 'other_visible_issues';

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
            findings: mappedFindings,
            disclosures: [`Multimodal creative visual analysis executed via Google Gemini Vision (${usedModel}).`],
          };
        }
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
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
  const logoFindings = auditImageLogoAndBrandIdentity(imageSummary, activeAssets);
  localFindings.push(...logoFindings);

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
    findings: localFindings,
    disclosures,
  };
}
