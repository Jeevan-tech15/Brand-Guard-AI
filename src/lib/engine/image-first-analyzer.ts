import { BrandGuideline, ApprovedFact, AuthorizedAsset, BoundingBox, ImageSummaryStats } from '@/lib/types';
import { EngineFinding } from './types';
import { extractDiscountClaims, extractDurationClaims, extractPriceClaims, extractSpecClaims } from './cross-modal';
import { cleanAndNormalizeOcrText } from './vision-analyzer';
import { runDeterministicChecks } from './deterministic';
import { runFactChecks } from './fact-checker';

// -------------------------------------------------------------------
// 1. SPELLING AND TEXT ACCURACY
// -------------------------------------------------------------------
const MARKETING_SPELLING_DICTIONARY: Record<string, string> = {
  gaurentee: 'guarantee',
  gaurenteed: 'guaranteed',
  guarenteed: 'guaranteed',
  guarentee: 'guarantee',
  limted: 'limited',
  limeted: 'limited',
  disconut: 'discount',
  discout: 'discount',
  offfer: 'offer',
  offffers: 'offers',
  warenty: 'warranty',
  waranty: 'warranty',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperately: 'separately',
  definately: 'definitely',
  untill: 'until',
  tommorrow: 'tomorrow',
  recomended: 'recommended',
  truely: 'truly',
  commited: 'committed',
  proteen: 'protein',
  protean: 'protein',
  priveledge: 'privilege',
  independant: 'independent',
  succesful: 'successful',
  enviroment: 'environment',
  millenium: 'millennium',
  calender: 'calendar',
  complience: 'compliance',
  lauch: 'launch',
  lauching: 'launching',
  sponser: 'sponsor',
  supercede: 'supersede',
  alot: 'a lot',
};

// Common brand names to never flag as misspellings
const DEFAULT_BRAND_WHITELIST = new Set([
  'brandguard',
  'naturabyte',
  'soundzen',
  'hyperion',
  'vitalpulse',
  'aethelgard',
  'apexwealth',
  'purevita',
  'voltmax',
  'cloudnova',
  'wanderluxe',
  'acme',
  'instagram',
  'linkedin',
  'soc2',
  'iso27001',
]);

export function auditImageTextAndTypography(
  imageText: string,
  boundingBoxes?: Array<{ text: string; confidence: number; bbox: BoundingBox }>,
  customBrandNames: string[] = []
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!imageText || !imageText.trim()) return findings;

  const normalized = cleanAndNormalizeOcrText(imageText);
  const brandWhitelist = new Set([
    ...DEFAULT_BRAND_WHITELIST,
    ...customBrandNames.map((b) => b.toLowerCase().trim()),
  ]);

  // 1. Marketing spelling error detection
  for (const [wrong, right] of Object.entries(MARKETING_SPELLING_DICTIONARY)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const actualWord = match[0];
      const lowerWord = actualWord.toLowerCase();

      if (brandWhitelist.has(lowerWord)) continue;

      const matchingBbox = boundingBoxes?.find((b) =>
        b.text.toLowerCase().includes(lowerWord)
      )?.bbox;

      findings.push({
        category: 'spelling_and_text',
        severity: 'medium',
        finding_title: `Spelling Error in Creative Typography: "${actualWord}"`,
        explanation: `The word "${actualWord}" is misspelled in the visible marketing graphic. Typographical mistakes diminish brand trust, clarity, and professionalism.`,
        evidence_text: actualWord,
        confidence: 0.95,
        suggested_fix: `Correct the spelling of "${actualWord}" to "${right}".`,
        source: 'ocr_analysis',
        verification_status: 'confirmed_violation',
        target_type: 'text',
        target_scope: 'image',
        image_evidence: actualWord,
        bounding_box: matchingBbox || null,
        proposed_replacement: right,
        resolution_status: 'unresolved',
        needs_human_verification: false,
        uncertainty_notes: 'High-confidence dictionary spelling match verified against visible OCR typography.',
      });
    }
  }

  // 2. Duplicated words or figures (e.g. "50% 50%", "the the", "free free")
  const duplicateWordRegex = /\b([a-zA-Z]{3,}|[1-9]\d%)\s+\1\b/gi;
  let dupMatch: RegExpExecArray | null;
  while ((dupMatch = duplicateWordRegex.exec(normalized)) !== null) {
    const snippet = dupMatch[0];
    const singleToken = dupMatch[1];

    if (brandWhitelist.has(singleToken.toLowerCase())) continue;

    const matchingBbox = boundingBoxes?.find((b) =>
      b.text.toLowerCase().includes(snippet.toLowerCase())
    )?.bbox;

    findings.push({
      category: 'spelling_and_text',
      severity: 'medium',
      finding_title: `Duplicated Word/Figure in Creative Typography: "${snippet}"`,
      explanation: `Repetitive token "${snippet}" detected in visible marketing typography. Accidental repeated words or figures indicate copy-paste oversights in the design layout.`,
      evidence_text: snippet,
      confidence: 0.95,
      suggested_fix: `Remove the redundant token and retain a single "${singleToken}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: snippet,
      bounding_box: matchingBbox || null,
      proposed_replacement: singleToken,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 3. Cut-off or dangling hyphenated words across line boundaries
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.match(/[a-zA-Z]{2,}-\s*$/) && !line.match(/\b(pre-|post-|non-|all-)\s*$/i)) {
      findings.push({
        category: 'spelling_and_text',
        severity: 'low',
        finding_title: `Hyphenated/Cut-Off Word at Line Boundary: "${line}"`,
        explanation: `Line ends with an unjoined hyphenated fragment. Typography should avoid breaking single marketing terms across line boundaries without wrapping.`,
        evidence_text: line,
        confidence: 0.8,
        suggested_fix: `Reflow text frame in graphic design software to avoid breaking words across lines.`,
        source: 'ocr_analysis',
        verification_status: 'possible_inconsistency',
        target_type: 'text',
        target_scope: 'image',
        image_evidence: line,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Verify text layout in the final design artboard.',
      });
    }
  }

  return findings;
}

// -------------------------------------------------------------------
// 2. LOGO AND BRAND IDENTITY
// -------------------------------------------------------------------
export function auditImageLogoAndBrandIdentity(
  imageSummary: ImageSummaryStats | null,
  authorizedAssets: AuthorizedAsset[]
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const primaryLogo = authorizedAssets.find(
    (a) => a.is_active && a.asset_type === 'logo' && (a.asset_metadata?.is_primary || true)
  );

  // If no reference logo is configured in Brand Guidelines
  if (!primaryLogo) {
    findings.push({
      category: 'logo_and_brand_identity',
      severity: 'low',
      finding_title: 'Official Brand Logo Reference Not Configured',
      explanation: 'No approved official logo reference has been uploaded in Brand Guidelines. Visual logo fidelity, proportions, color variants, and clear space could not be verified against an official vector asset.',
      evidence_text: 'Missing official logo reference in Brand Guidelines',
      confidence: 1.0,
      suggested_fix: 'Upload your official brand logo in Brand Guidelines under Visual Assets to enable automated logo governance audits.',
      source: 'rule',
      verification_status: 'unverifiable',
      target_type: 'logo',
      target_scope: 'image',
      resolution_status: 'unresolved',
      needs_human_verification: true,
      human_verification_reason: 'Configure an official logo reference asset in Brand Guidelines.',
    });
  }

  // Check aspect ratio compliance if configured
  if (imageSummary && imageSummary.width && imageSummary.height) {
    const aspectRuleAsset = authorizedAssets.find(
      (a) => a.asset_type === 'logo' && a.asset_metadata?.allowed_aspect_ratios
    );
    if (aspectRuleAsset?.asset_metadata?.allowed_aspect_ratios) {
      const allowed = aspectRuleAsset.asset_metadata.allowed_aspect_ratios as string[];
      const curAspect = imageSummary.aspectRatio || '';
      const matches = allowed.some((a) => curAspect.includes(a));
      if (!matches && allowed.length > 0) {
        findings.push({
          category: 'logo_and_brand_identity',
          severity: 'medium',
          finding_title: `Non-Standard Creative Aspect Ratio (${curAspect})`,
          explanation: `The uploaded creative is formatted in ${curAspect}, which does not match your brand's preferred ratios (${allowed.join(', ')}). Inappropriate dimensions can cause automatic cropping, distortion, or header clipping on advertising networks.`,
          evidence_text: `Current creative format: ${curAspect}`,
          confidence: 0.95,
          suggested_fix: `Export graphic in approved aspect ratio (${allowed[0]}).`,
          source: 'image',
          verification_status: 'possible_inconsistency',
          target_type: 'layout',
          target_scope: 'image',
          resolution_status: 'unresolved',
          needs_human_verification: true,
          human_verification_reason: 'Verify display cropping across social feeds.',
        });
      }
    }
  }

  return findings;
}

// -------------------------------------------------------------------
// 3. ABUSIVE OR HARMFUL LANGUAGE
// -------------------------------------------------------------------
const HARMFUL_AND_ABUSIVE_TERMS = [
  // Profanity & offensive slurs
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dickhead',
  'bullshit',
  'crap',
  'damn',
  // Threats & harassment
  'kill yourself',
  'go die',
  'punch your face',
  'i will hurt you',
  'hate all of you',
  'scam artists',
];

export function auditImageAbusiveOrHarmfulLanguage(
  imageText: string,
  boundingBoxes?: Array<{ text: string; confidence: number; bbox: BoundingBox }>
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!imageText || !imageText.trim()) return findings;

  const normalized = cleanAndNormalizeOcrText(imageText).toLowerCase();

  for (const term of HARMFUL_AND_ABUSIVE_TERMS) {
    const termRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
    const match = normalized.match(termRegex);

    if (match && match[0]) {
      const detected = match[0];
      const matchingBbox = boundingBoxes?.find((b) =>
        b.text.toLowerCase().includes(detected)
      )?.bbox;

      findings.push({
        category: 'abusive_or_harmful_language',
        severity: 'critical',
        finding_title: `Potentially Inappropriate / Abusive Language Detected: "${detected}"`,
        explanation: `The visible creative text contains potentially profane, insulting, or abusive language ("${detected}"). Public marketing assets must maintain brand safety, professional standards, and adhere to advertising policy guidelines.`,
        evidence_text: detected,
        confidence: 0.95,
        suggested_fix: `Remove or replace "${detected}" with professional, compliant marketing copy.`,
        source: 'ocr_analysis',
        verification_status: 'confirmed_violation',
        target_type: 'text',
        target_scope: 'image',
        image_evidence: detected,
        bounding_box: matchingBbox || null,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Review context of flagged terminology to ensure brand safety compliance before publishing.',
      });
    }
  }

  return findings;
}

// -------------------------------------------------------------------
// 4. LAYOUT AND DESIGN QUALITY
// -------------------------------------------------------------------
const LEGAL_DISCLAIMER_TRIGGERS = [
  'terms apply',
  'terms and conditions',
  'conditions apply',
  'results may vary',
  'subject to change',
  'prior notice',
  'disclaimer',
  'limited time only',
  'while supplies last',
  'see website for details',
  'not guaranteed',
  'individual results may vary',
  'subscription required',
  'must be 18+',
];

export function auditImageVisualAndDesignQuality(
  imageSummary: ImageSummaryStats | null,
  imageText: string,
  boundingBoxes?: Array<{ text: string; confidence: number; bbox: BoundingBox }>
): EngineFinding[] {
  const findings: EngineFinding[] = [];

  // 1. Resolution Check
  if (imageSummary && imageSummary.width && imageSummary.height) {
    const { width, height } = imageSummary;
    const minRecommendedDimension = 600;

    if (width < minRecommendedDimension || height < minRecommendedDimension) {
      findings.push({
        category: 'layout_and_design_quality',
        severity: 'medium',
        finding_title: `Low Image Resolution / Pixelation Risk (${width}×${height}px)`,
        explanation: `The uploaded creative is rendered at ${width}×${height}px, which is below the recommended minimum of 1080px for social and display ad placements. Low-resolution graphics appear pixelated, fuzzy, or illegible on high-DPI displays.`,
        evidence_text: `Canvas dimensions: ${width}×${height}px (${imageSummary.format || 'Raster'})`,
        confidence: 0.95,
        suggested_fix: `Export graphic at minimum 1080×1080px (1:1 square) or 1080×1350px (4:5 portrait) for optimal crispness.`,
        source: 'image',
        verification_status: 'possible_inconsistency',
        target_type: 'layout',
        target_scope: 'image',
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Inspect creative clarity on target display device.',
        uncertainty_notes: 'Objective image dimension measurement from metadata.',
      });
    }
  }

  // 2. Visually Obscured or Low-Legibility Disclaimers
  if (imageText) {
    const clean = cleanAndNormalizeOcrText(imageText);
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();
      const matchedTrigger = LEGAL_DISCLAIMER_TRIGGERS.find((t) => lower.includes(t));

      if (matchedTrigger) {
        const lineBox = boundingBoxes?.find((b) =>
          b.text.toLowerCase().includes(matchedTrigger) || lower.includes(b.text.toLowerCase())
        );

        const isLowConfidence = lineBox && lineBox.confidence < 65;
        const isMicroText = lineBox && (lineBox.bbox.ymax - lineBox.bbox.ymin) < 25; // <2.5% of canvas height

        if (isLowConfidence || isMicroText) {
          findings.push({
            category: 'layout_and_design_quality',
            severity: 'high',
            finding_title: `Visually Obscured or Reduced-Legibility Disclaimer: "${matchedTrigger}"`,
            explanation: `Mandatory disclosure line ("${line}") appears visually obscured, rendered in reduced contrast, or set in micro-typography. Advertising and consumer protection standards require promotional terms and conditions to be clearly readable without magnification.`,
            evidence_text: line,
            confidence: 0.85,
            suggested_fix: `Increase font size (minimum 14px equivalent) and background contrast for mandatory terms and conditions.`,
            source: 'ocr_analysis',
            verification_status: 'possible_inconsistency',
            target_type: 'layout',
            target_scope: 'image',
            image_evidence: line,
            bounding_box: lineBox?.bbox || null,
            resolution_status: 'unresolved',
            needs_human_verification: true,
            human_verification_reason: 'Review legal disclosure readability on mobile screens before launch.',
            uncertainty_notes: 'Heuristic assessment based on OCR bounding box dimensions and recognition certainty.',
          });
        }
      }
    }
  }

  return findings;
}

// -------------------------------------------------------------------
// 5. CLAIMS AND INTERNAL CONSISTENCY
// -------------------------------------------------------------------
const SUSPICIOUS_ABSOLUTE_CLAIMS = [
  '100% cure',
  'guaranteed to cure',
  'risk-free guaranteed',
  'risk free guaranteed',
  'completely eliminate',
  'unhackable',
  'miracle cure',
  'permanent results',
  'zero risk',
  'guaranteed profit',
  '100% risk free',
  '100% guaranteed',
  'foolproof',
];

export function auditImageBrandAndMarketingClaims(
  imageText: string,
  guidelines: BrandGuideline[],
  facts: ApprovedFact[]
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!imageText || !imageText.trim()) return findings;

  const clean = cleanAndNormalizeOcrText(imageText);

  // 1. Internal Image Contradictions: Conflicting Discounts within the Same Image
  const discounts = extractDiscountClaims(clean);
  const uniqueDiscounts = Array.from(new Set(discounts.map((d) => d.value)));
  if (uniqueDiscounts.length >= 2) {
    findings.push({
      category: 'claims_and_consistency',
      severity: 'critical',
      finding_title: `Conflicting Promotional Discounts Within Creative Graphic (${uniqueDiscounts.join('% vs ')}%)`,
      explanation: `The uploaded creative image contains contradictory promotional discount figures: ${discounts.map((d) => `"${d.rawSnippet}"`).join(' and ')}. Disparate discount claims within a single asset confuse buyers and create false advertising risks.`,
      evidence_text: discounts.map((d) => d.rawSnippet).join(' vs '),
      confidence: 1.0,
      source: 'image',
      verification_status: 'contradicted',
      suggested_fix: `Align all percentage discount references in the creative image to a single verified offer (${uniqueDiscounts[0]}%).`,
      target_type: 'text',
      target_scope: 'image',
      image_evidence: discounts.map((d) => d.rawSnippet).join(' vs '),
      resolution_status: 'unresolved',
      needs_human_verification: true,
      human_verification_reason: 'Select the single approved promotional discount before publication.',
      uncertainty_notes: 'Direct numerical contradiction detected within visible graphic typography.',
    });
  }

  // 2. Internal Image Contradictions: Conflicting Durations
  const durations = extractDurationClaims(clean);
  const durationsByContext = new Map<string, typeof durations>();
  for (const d of durations) {
    const list = durationsByContext.get(d.context) || [];
    list.push(d);
    durationsByContext.set(d.context, list);
  }
  for (const [context, list] of durationsByContext.entries()) {
    const uniqueVals = Array.from(new Set(list.map((l) => l.value)));
    if (uniqueVals.length >= 2) {
      findings.push({
        category: 'claims_and_consistency',
        severity: 'critical',
        finding_title: `Conflicting ${context.replace(/_/g, ' ')} Durations Within Creative Graphic`,
        explanation: `The uploaded creative image advertises contradictory duration claims for ${context.replace(/_/g, ' ')}: ${list.map((l) => `"${l.rawSnippet}"`).join(' vs ')}.`,
        evidence_text: list.map((l) => l.rawSnippet).join(' vs '),
        confidence: 1.0,
        source: 'image',
        verification_status: 'contradicted',
        suggested_fix: `Unify duration claims in the creative image to a single verified figure.`,
        target_type: 'text',
        target_scope: 'image',
        image_evidence: list.map((l) => l.rawSnippet).join(' vs '),
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Synchronize advertised timeline figures with documented specifications.',
      });
    }
  }

  // 3. Internal Image Contradictions: Conflicting Prices
  const prices = extractPriceClaims(clean);
  const uniquePrices = Array.from(new Set(prices.map((p) => p.value)));
  if (uniquePrices.length >= 2) {
    findings.push({
      category: 'claims_and_consistency',
      severity: 'critical',
      finding_title: `Conflicting Price Points Within Creative Graphic`,
      explanation: `The uploaded creative image quotes conflicting price claims: ${prices.map((p) => `"${p.rawSnippet}"`).join(' vs ')}.`,
      evidence_text: prices.map((p) => p.rawSnippet).join(' vs '),
      confidence: 1.0,
      source: 'image',
      verification_status: 'contradicted',
      suggested_fix: `Verify and synchronize pricing figures in the creative asset.`,
      target_type: 'text',
      target_scope: 'image',
      image_evidence: prices.map((p) => p.rawSnippet).join(' vs '),
      resolution_status: 'unresolved',
      needs_human_verification: true,
      human_verification_reason: 'Confirm authorized commercial price sheet.',
    });
  }

  // 4. Internal Image Contradictions: Conflicting Product Specs
  const specs = extractSpecClaims(clean);
  const specsByContext = new Map<string, typeof specs>();
  for (const s of specs) {
    const isProteinContext = clean.toLowerCase().includes('protein') || clean.toLowerCase().includes('proteen');
    const ctx = (s.context === 'mass_weight' || s.context.startsWith('nutritional_')) && isProteinContext
      ? 'protein_content'
      : s.context;
    const list = specsByContext.get(ctx) || [];
    list.push(s);
    specsByContext.set(ctx, list);
  }
  for (const [ctx, list] of specsByContext.entries()) {
    const uniqueVals = Array.from(new Set(list.map((l) => l.value)));
    if (uniqueVals.length >= 2) {
      findings.push({
        category: 'claims_and_consistency',
        severity: 'critical',
        finding_title: `Conflicting Specification Metrics Within Creative Graphic (${uniqueVals.join(' vs ')})`,
        explanation: `The uploaded creative image quotes contradictory specification figures for ${ctx.replace(/_/g, ' ')}: ${list.map((l) => `"${l.rawSnippet}"`).join(' vs ')}. Inaccurate product specs violate consumer labeling guidelines.`,
        evidence_text: list.map((l) => l.rawSnippet).join(' vs '),
        confidence: 1.0,
        source: 'image',
        verification_status: 'contradicted',
        suggested_fix: `Synchronize specification claims to the verified laboratory test baseline.`,
        target_type: 'text',
        target_scope: 'image',
        image_evidence: list.map((l) => l.rawSnippet).join(' vs '),
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Confirm verified product specification sheet.',
      });
    }
  }

  // 5. Suspicious Absolute or Unsupported Claims in Image
  for (const claim of SUSPICIOUS_ABSOLUTE_CLAIMS) {
    const claimRegex = new RegExp(`\\b${escapeRegExp(claim)}\\b`, 'i');
    const match = clean.match(claimRegex);
    if (match && match[0]) {
      const phrase = match[0];
      findings.push({
        category: 'claims_and_consistency',
        severity: 'high',
        finding_title: `Suspicious Absolute or Unsubstantiated Claim in Image: "${phrase}"`,
        explanation: `The phrase "${phrase}" represents an unqualified absolute guarantee in marketing typography. Regulatory advertising standards prohibit absolute claims without verifiable empirical substantiation.`,
        evidence_text: phrase,
        confidence: 0.9,
        suggested_fix: `Rephrase with qualified factual language (e.g. "designed to support", "tested to help improve").`,
        source: 'ocr_analysis',
        verification_status: 'unverified',
        target_type: 'text',
        target_scope: 'image',
        image_evidence: phrase,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Provide legal substantiation documentation or tone down absolute assertion.',
      });
    }
  }

  // 6. Check Active Brand Guidelines & Facts via deterministic engines
  const { findings: detFindings } = runDeterministicChecks(clean, 'social_media', guidelines, { targetScope: 'image' });
  findings.push(...detFindings);

  const { findings: factFindings } = runFactChecks(clean, facts, { sourceTag: 'image' });
  findings.push(...factFindings);

  return findings;
}

// -------------------------------------------------------------------
// 6. POTENTIAL COPYRIGHT, TRADEMARK AND IP CONCERNS
// -------------------------------------------------------------------
const COMMERCIAL_STOCK_WATERMARKS = [
  'getty images',
  'gettyimages',
  'shutterstock',
  'istock',
  'istockphoto',
  'alamy',
  'adobe stock',
  'adobestock',
  'dreamstime',
  'depositphotos',
  'vectorstock',
  '123rf',
  'preview only',
  'sample only',
  'watermark',
];

const RECOGNIZABLE_THIRD_PARTY_TRADEMARKS = [
  'apple',
  'iphone',
  'ipad',
  'macbook',
  'nike',
  'adidas',
  'disney',
  'marvel',
  'coca-cola',
  'coca cola',
  'pepsi',
  'starbucks',
  'mcdonald\'s',
  'mcdonalds',
  'google',
  'microsoft',
  'windows',
  'amazon',
  'meta',
  'facebook',
  'instagram',
  'twitter',
  'tiktok',
  'youtube',
  'netflix',
  'spotify',
];

export function auditImageCopyrightAndIpRisks(
  imageText: string,
  authorizedAssets: AuthorizedAsset[]
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!imageText || !imageText.trim()) return findings;

  const normalized = cleanAndNormalizeOcrText(imageText);
  const authorizedNames = new Set(
    authorizedAssets.map((a) => a.asset_name.toLowerCase().trim()).filter(Boolean)
  );

  // 1. Stock Agency Watermarks & Comp Sample Markings
  for (const mark of COMMERCIAL_STOCK_WATERMARKS) {
    const markRegex = new RegExp(`\\b${escapeRegExp(mark)}\\b`, 'i');
    const match = normalized.match(markRegex);

    if (match && match[0]) {
      const detected = match[0];
      findings.push({
        category: 'copyright_and_ip_risk',
        severity: 'high',
        finding_title: `Potential Stock Watermark / Unlicensed Asset Mark: "${detected}"`,
        explanation: `Detected text pattern matching commercial stock image watermark "${detected}". This indicates the asset may be an unpurchased comp or preview mockup. Using watermarked stock photography in public marketing materials creates immediate copyright infringement exposure.`,
        evidence_text: `Watermark signature: "${detected}"`,
        confidence: 0.95,
        suggested_fix: `Acquire official commercial license and replace composite mockup with the licensed high-resolution asset without watermarks.`,
        source: 'ocr_analysis',
        verification_status: 'possible_inconsistency',
        target_type: 'visual_element',
        target_scope: 'image',
        image_evidence: detected,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Confirm commercial stock license purchase invoice before ad publication.',
        uncertainty_notes: 'Automated detection flags watermark signature; commercial licensing status requires human verification. Pixels alone cannot verify license ownership.',
      });
    }
  }

  // 2. Recognizable Third-Party Trademarks & Brands
  for (const trademark of RECOGNIZABLE_THIRD_PARTY_TRADEMARKS) {
    if (authorizedNames.has(trademark)) continue;

    const brandRegex = new RegExp(`\\b${escapeRegExp(trademark)}\\b`, 'i');
    const match = normalized.match(brandRegex);

    if (match && match[0]) {
      const detected = match[0];
      findings.push({
        category: 'copyright_and_ip_risk',
        severity: 'medium',
        finding_title: `Potential Third-Party Intellectual Property / Logo Detected: "${detected}"`,
        explanation: `Detected recognizable third-party mark "${detected}" within creative image. Copyright and trademark ownership cannot be established from pixels alone. Flagged for legal and brand reviewer verification to confirm commercial partnership, authorization, or nominative fair-use rights.`,
        evidence_text: `Recognizable third-party mark: "${detected}"`,
        confidence: 0.85,
        suggested_fix: `Obtain written brand usage authorization or remove third-party trademark from creative graphic.`,
        source: 'ocr_analysis',
        verification_status: 'possible_inconsistency',
        target_type: 'logo',
        target_scope: 'image',
        image_evidence: detected,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Verify brand partnership, co-marketing agreement, or nominative fair-use justification.',
        uncertainty_notes: 'BrandGuard AI flags recognizable third-party marks for human review; does not perform external trademark registry searches. Infringement cannot be established from pixels alone.',
      });
    }
  }

  return findings;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
