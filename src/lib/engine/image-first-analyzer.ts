import { BrandGuideline, ApprovedFact, AuthorizedAsset, RuleSeverity, BoundingBox, ImageSummaryStats } from '@/lib/types';
import { EngineFinding } from './types';
import { extractDiscountClaims, extractDurationClaims, extractPriceClaims, extractSpecClaims } from './cross-modal';
import { cleanAndNormalizeOcrText } from './vision-analyzer';

// -------------------------------------------------------------------
// PILLAR A: SPELLING, TEXT & TYPOGRAPHY
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

// Recognized brand names to NEVER flag as spelling errors
const BRAND_NAME_WHITELIST = new Set([
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
]);

export function auditImageTextAndTypography(
  imageText: string,
  boundingBoxes?: Array<{ text: string; confidence: number; bbox: BoundingBox }>
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!imageText || !imageText.trim()) return findings;

  const normalized = cleanAndNormalizeOcrText(imageText);

  // 1. Marketing spelling error detection
  for (const [wrong, right] of Object.entries(MARKETING_SPELLING_DICTIONARY)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const actualWord = match[0];
      const lowerWord = actualWord.toLowerCase();

      // Skip whitelisted brand names
      if (BRAND_NAME_WHITELIST.has(lowerWord)) continue;

      // Find matching bounding box if available
      const matchingBbox = boundingBoxes?.find((b) =>
        b.text.toLowerCase().includes(lowerWord)
      )?.bbox;

      findings.push({
        category: 'spelling_and_grammar',
        severity: 'medium',
        finding_title: `Spelling Error in Creative Typography: "${actualWord}"`,
        explanation: `The word "${actualWord}" is misspelled in the marketing creative image. Visible typographical errors undermine brand credibility and professionalism.`,
        evidence_text: actualWord,
        confidence: 0.95,
        suggested_fix: `Correct the spelling of "${actualWord}" to "${right}".`,
        source: 'image',
        verification_status: 'confirmed_violation',
        target_type: 'text',
        target_scope: 'image',
        image_evidence: actualWord,
        bounding_box: matchingBbox || null,
        proposed_replacement: right,
        resolution_status: 'unresolved',
        needs_human_verification: false,
        uncertainty_notes: 'High-confidence deterministic spelling match.',
      });
    }
  }

  // 2. Duplicated words or figures in typography (e.g. "50% 50%", "the the", "free free")
  const duplicateWordRegex = /\b([a-zA-Z]{3,}|[1-9]\d%)\s+\1\b/gi;
  let dupMatch: RegExpExecArray | null;
  while ((dupMatch = duplicateWordRegex.exec(normalized)) !== null) {
    const snippet = dupMatch[0];
    const singleToken = dupMatch[1];

    if (BRAND_NAME_WHITELIST.has(singleToken.toLowerCase())) continue;

    const matchingBbox = boundingBoxes?.find((b) =>
      b.text.toLowerCase().includes(snippet.toLowerCase())
    )?.bbox;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'medium',
      finding_title: `Duplicated Word/Figure in Creative Typography: "${snippet}"`,
      explanation: `Repetitive token "${snippet}" detected in visible marketing typography. Accidental repeated words or percentage figures indicate copy-paste errors during graphic design.`,
      evidence_text: snippet,
      confidence: 0.95,
      suggested_fix: `Remove the duplicate token and retain a single "${singleToken}".`,
      source: 'image',
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

  // 3. Cut-off or truncated text lines
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // If a line ends with a dangling hyphen and incomplete word
    if (line.match(/[a-zA-Z]{2,}-\s*$/) && !line.match(/\b(pre-|post-|non-|all-)\s*$/i)) {
      findings.push({
        category: 'spelling_and_grammar',
        severity: 'low',
        finding_title: `Hyphenated/Cut-Off Word at Line Boundary: "${line}"`,
        explanation: `Line ends with an unjoined hyphenated fragment. Typography should avoid breaking single marketing terms across line boundaries without wrapping.`,
        evidence_text: line,
        confidence: 0.8,
        suggested_fix: `Reflow text frame in design software to avoid breaking words across lines.`,
        source: 'image',
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
// PILLAR B: VISUAL & DESIGN QUALITY
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

  // 1. Canvas Resolution Check
  if (imageSummary && imageSummary.width && imageSummary.height) {
    const { width, height } = imageSummary;
    const minRecommendedDimension = 600;

    if (width < minRecommendedDimension || height < minRecommendedDimension) {
      findings.push({
        category: 'visual_design_quality',
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

  // 2. Visually Obscured or Low-Legibility Disclaimers / Legal Terms
  if (imageText) {
    const clean = cleanAndNormalizeOcrText(imageText);
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();
      const matchedTrigger = LEGAL_DISCLAIMER_TRIGGERS.find((t) => lower.includes(t));

      if (matchedTrigger) {
        // Look up bounding box and confidence for this line
        const lineBox = boundingBoxes?.find((b) =>
          b.text.toLowerCase().includes(matchedTrigger) || lower.includes(b.text.toLowerCase())
        );

        const isLowConfidence = lineBox && lineBox.confidence < 65;
        // Bounding box height percentage relative to canvas: if < 2.5% of canvas height, it's micro-text
        const isMicroText = lineBox && (lineBox.bbox.ymax - lineBox.bbox.ymin) < 25; // <2.5% of 1000

        if (isLowConfidence || isMicroText) {
          findings.push({
            category: 'visual_design_quality',
            severity: 'high',
            finding_title: `Visually Obscured or Reduced-Legibility Disclaimer: "${matchedTrigger}"`,
            explanation: `Mandatory disclosure line ("${line}") appears visually obscured, rendered in reduced contrast, or set in micro-typography. Advertising and consumer protection standards require promotional terms and conditions to be clearly readable to consumers without magnification.`,
            evidence_text: line,
            confidence: 0.85,
            suggested_fix: `Increase font size (minimum 14px equivalent) and background contrast for mandatory terms and conditions.`,
            source: 'image',
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
// PILLAR C: COPYRIGHT & INTELLECTUAL PROPERTY RISKS
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

  // Set of authorized asset names
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
        source: 'image',
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
    // If this brand is in the company's authorized assets, skip
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
        source: 'image',
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

// -------------------------------------------------------------------
// PILLAR D: BRAND & MARKETING CLAIM CHECKS IN IMAGE
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
      category: 'brand_marketing_claim',
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
      uncertainty_notes: 'Direct contradiction detected within visible typography.',
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
        category: 'brand_marketing_claim',
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
        human_verification_reason: 'Synchronize advertised timeline figures with engineering SLAs.',
      });
    }
  }

  // 3. Internal Image Contradictions: Conflicting Prices
  const prices = extractPriceClaims(clean);
  const uniquePrices = Array.from(new Set(prices.map((p) => p.value)));
  if (uniquePrices.length >= 2) {
    findings.push({
      category: 'brand_marketing_claim',
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

  // 4. Internal Image Contradictions: Conflicting Product Specs / Nutritional Metrics
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
        category: 'brand_marketing_claim',
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
        category: 'brand_marketing_claim',
        severity: 'high',
        finding_title: `Suspicious Absolute or Unsubstantiated Claim in Image: "${phrase}"`,
        explanation: `The phrase "${phrase}" represents an unqualified absolute guarantee in marketing typography. Regulatory advertising standards prohibit absolute claims without verifiable empirical substantiation.`,
        evidence_text: phrase,
        confidence: 0.9,
        suggested_fix: `Rephrase with qualified factual language (e.g. "designed to support", "tested to help improve").`,
        source: 'image',
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

  // 6. Check Active Brand Guidelines on Image Typography
  for (const rule of guidelines) {
    if (!rule.is_active) continue;
    const config = rule.rule_configuration || {};
    const prohibitedTerms = [
      ...(config.keywords || []),
      ...(config.forbidden_examples || []),
    ];

    for (const term of prohibitedTerms) {
      if (!term || typeof term !== 'string' || term.trim().length < 2) continue;
      const termRegex = new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, 'i');
      const match = clean.match(termRegex);
      if (match && match[0]) {
        const found = match[0];
        findings.push({
          category: 'brand_marketing_claim',
          severity: rule.severity || 'high',
          finding_title: `Prohibited Term Detected in Creative Typography: "${found}"`,
          explanation: `The term "${found}" in creative image typography violates active brand policy "${rule.title}": ${rule.description}`,
          evidence_text: found,
          guideline_id: rule.id,
          confidence: 1.0,
          suggested_fix: config.allowed_examples?.[0]
            ? `Replace with approved brand terminology: "${config.allowed_examples[0]}"`
            : `Remove prohibited term "${found}" from marketing graphic.`,
          source: 'image',
          verification_status: 'confirmed_violation',
          target_type: 'text',
          target_scope: 'image',
          image_evidence: found,
          resolution_status: 'unresolved',
          needs_human_verification: false,
        });
      }
    }
  }

  // 7. Check Active Facts on Image Typography
  for (const fact of facts) {
    if (!fact.is_active || !fact.fact_text) continue;
    const factText = fact.fact_text.toLowerCase();

    const numMatch = factText.match(/(\d+(?:\.\d+)?%|\d+\s*g\b|\d+\s*hours?)/i);
    if (numMatch) {
      const factMetric = numMatch[1].replace(/\s+/g, '');
      if (factText.includes('uptime') && clean.toLowerCase().includes('uptime')) {
        const imgUptime = clean.match(/(\d+(?:\.\d+)?%)\s*uptime/i);
        if (imgUptime && imgUptime[1].replace(/\s+/g, '') !== factMetric) {
          findings.push({
            category: 'brand_marketing_claim',
            severity: 'critical',
            finding_title: `Unverified Corporate Fact / Metric Inconsistency in Image`,
            explanation: `Image claims "${imgUptime[0]}", which contradicts verified corporate fact "${fact.fact_text}" (Source: ${fact.source_name}).`,
            evidence_text: imgUptime[0],
            fact_id: fact.id,
            confidence: 0.95,
            suggested_fix: `Update creative image claim to match verified corporate benchmark: "${fact.fact_text}".`,
            source: 'image',
            verification_status: 'contradicted',
            target_type: 'text',
            target_scope: 'image',
            image_evidence: imgUptime[0],
            resolution_status: 'unresolved',
            needs_human_verification: true,
            human_verification_reason: 'Confirm benchmark against officially documented corporate SLA.',
          });
        }
      }
    }
  }

  return findings;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
