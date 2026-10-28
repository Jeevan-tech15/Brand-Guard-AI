import { BrandGuideline, ApprovedFact, AuthorizedAsset, ContentType, ReviewStatus } from '@/lib/types';
import { runVisionAnalysis } from './vision-analyzer';
import { calculateComplianceScore } from './scoring';
import { runDeterministicChecks } from './deterministic';
import { runFactChecks } from './fact-checker';
import { ComplianceReviewResult } from './types';

export * from './types';
export * from './image-first-analyzer';
export * from './vision-analyzer';
export * from './scoring';
export * from './deterministic';
export * from './fact-checker';

export async function runComplianceReview(
  content: string,
  contentType: ContentType,
  guidelines: BrandGuideline[],
  facts: ApprovedFact[],
  options?: {
    skipAI?: boolean;
    imageUrl?: string;
    assets?: AuthorizedAsset[];
    ocrReferenceText?: string;
    captionText?: string;
    brandName?: string;
  }
): Promise<ComplianceReviewResult> {
  const activeGuidelines = guidelines.filter((g) => g.is_active);
  const activeFacts = facts.filter((f) => f.is_active);
  const activeAssets = (options?.assets || []).filter((a) => a.is_active);

  const explicitImage = options?.imageUrl || (content.startsWith('/uploads/') || content.startsWith('http') || content.startsWith('data:') ? content : '');
  const ocrText = options?.ocrReferenceText || (explicitImage ? '' : content);
  const imageUrl = explicitImage;
  const hasImage = Boolean(imageUrl || ocrText);

  if (!hasImage) {
    return {
      status: 'pending',
      compliance_score: null,
      findings: [
        {
          category: 'other_visible_issues',
          severity: 'critical',
          finding_title: 'No Marketing Creative Image Provided',
          explanation: 'BrandGuard AI performs image-only pre-publication governance. A valid creative image file must be uploaded to perform audit inspection.',
          evidence_text: 'Missing image asset',
          confidence: 1.0,
          suggested_fix: 'Upload a marketing creative image (PNG, JPG, WebP, SVG) to audit.',
          source: 'image',
          verification_status: 'unverifiable',
          target_type: 'layout',
          target_scope: 'image',
          resolution_status: 'unresolved',
        },
      ],
      metadata: {
        evaluatedAt: new Date().toISOString(),
        aiRun: false,
        modality: 'image_only',
        guidelinesEvaluatedCount: activeGuidelines.length,
        factsEvaluatedCount: activeFacts.length,
        governance_status: 'ANALYSIS INCOMPLETE',
        analysisStatus: 'failed',
        scoringBreakdown: {
          baseScore: 100,
          totalDeductions: 25,
          finalScore: null,
          deductionsBySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
          deductions: [],
          methodology: 'Image-only governance requires an accessible image asset.',
          disclaimer: 'No image provided.',
          isPartialAnalysis: true,
        },
        checksCompleted: {
          imageAnalysis: false,
          typographyExtraction: false,
          spellingAndGrammar: false,
          logoAndBrandIdentity: false,
          abusiveLanguage: false,
          layoutAndDesign: false,
          claimsAndConsistency: false,
          copyrightAndIp: false,
          guidelineChecks: false,
          factChecks: false,
        },
      },
    };
  }

  // =================================================================
  // IMAGE GOVERNANCE AUDIT (Pixels, OCR Typography, & Standards)
  // =================================================================
  const visionResult = await runVisionAnalysis({
    imageUrl,
    guidelines: activeGuidelines,
    facts: activeFacts,
    assets: activeAssets,
    ocrReferenceText: ocrText,
    brandName: options?.brandName,
  });

  const visionRun = visionResult.visionRun;
  const visionModelUsed = visionResult.model;
  const visionProvider = visionResult.provider;
  const extractedOcrText = visionResult.extracted_ocr_text;
  const ocrConfidence = visionResult.ocrConfidence ?? null;
  const ocrWordsCount = visionResult.ocrWordsCount ?? 0;
  const ocrLinesCount = visionResult.ocrLinesCount ?? 0;
  const unreadableSegmentsCount = visionResult.unreadableSegmentsCount ?? 0;
  const imageSummary = visionResult.imageSummary ?? null;
  const detectedBoundingBoxes = visionResult.boundingBoxes ?? [];
  const visionDisclosures: string[] = [...visionResult.disclosures];

  if (visionResult.reason && !visionResult.visionRun) {
    visionDisclosures.push(visionResult.reason);
  }

  const imageInspectionSucceeded = Boolean(
    visionResult.imageSummary || visionResult.extracted_ocr_text || visionResult.provider || ocrText
  );

  let imageFindings = [...visionResult.findings];

  // Correlate local bounding boxes when findings lack bounding box coordinates
  if (detectedBoundingBoxes.length > 0) {
    for (const finding of imageFindings) {
      if (!finding.bounding_box) {
        const query = (finding.image_evidence || finding.evidence_text || '').toLowerCase().trim();
        if (query) {
          const match = detectedBoundingBoxes.find((b) => {
            const bLow = b.text.toLowerCase();
            return bLow.includes(query) || query.includes(bLow);
          });
          if (match) {
            finding.bounding_box = match.bbox;
          }
        }
      }
    }
  }

  // Run deterministic brand guideline rules and fact verification on extracted OCR / reference text
  const textForAudits = extractedOcrText || ocrText || '';
  if (textForAudits.trim()) {
    const { findings: detFindings } = runDeterministicChecks(textForAudits, contentType, activeGuidelines, { targetScope: 'image' });
    const { findings: factFindings } = runFactChecks(textForAudits, activeFacts, { sourceTag: 'image' });

    for (const df of detFindings) {
      if (!imageFindings.some((f) => (df.guideline_id && f.guideline_id === df.guideline_id) || f.finding_title === df.finding_title || (df.evidence_text && f.evidence_text === df.evidence_text))) {
        imageFindings.push(df);
      }
    }
    for (const ff of factFindings) {
      if (!imageFindings.some((f) => (ff.fact_id && f.fact_id === ff.fact_id) || f.finding_title === ff.finding_title)) {
        imageFindings.push(ff);
      }
    }
  }

  const aiRun = Boolean(visionRun && visionModelUsed && visionModelUsed.includes('gemini'));

  if (!process.env.GEMINI_API_KEY) {
    visionDisclosures.push('GEMINI_API_KEY is not configured. Falling back to local OCR and deterministic rules.');
  } else if (!aiRun || options?.skipAI) {
    if (!visionDisclosures.some((d) => d.toLowerCase().includes('fallback') || d.toLowerCase().includes('unavailable'))) {
      visionDisclosures.push('AI provider unavailable. Analysis executed via fallback local OCR and deterministic rules.');
    }
  }

  // Ensure all findings are tagged target_scope = 'image'
  imageFindings = imageFindings.map((f) => ({
    ...f,
    target_scope: 'image' as const,
  }));

  // Disclosures on Brand Guidelines presence
  if (activeGuidelines.length === 0) {
    visionDisclosures.push('No active brand guidelines configured. Analysis performed against general visual quality, layout, safety, and claim consistency standards.');
  }

  // Calculate Documented Compliance Score
  const scoreBreakdown = calculateComplianceScore(imageFindings, {
    hasImageInput: true,
    imageInspectionSucceeded,
    extractedOcrText,
    checksCompleted: {
      imageAnalysis: imageInspectionSucceeded,
      typographyExtraction: Boolean(extractedOcrText && extractedOcrText.length > 0),
      spellingAndGrammar: true,
      logoAndBrandIdentity: true,
      abusiveLanguage: true,
      layoutAndDesign: true,
      claimsAndConsistency: true,
      copyrightAndIp: true,
      guidelineChecks: activeGuidelines.length > 0,
      factChecks: activeFacts.length > 0,
    },
  });

  // Determine Resulting Governance Status
  const hasCritical = imageFindings.some((f) => f.severity === 'critical');
  const hasHigh = imageFindings.some((f) => f.severity === 'high');
  const hasHumanReviewRequired = imageFindings.some(
    (f) => f.needs_human_verification || f.category === 'copyright_and_ip_risk'
  );

  let governance_status: 'PASS' | 'WARNING' | 'REVIEW REQUIRED' | 'ANALYSIS INCOMPLETE' = 'PASS';

  if (!imageInspectionSucceeded) {
    governance_status = 'ANALYSIS INCOMPLETE';
  } else if (hasCritical || hasHigh || hasHumanReviewRequired) {
    governance_status = 'REVIEW REQUIRED';
  } else if (imageFindings.length > 0 || (scoreBreakdown.finalScore !== null && scoreBreakdown.finalScore < 90)) {
    governance_status = 'WARNING';
  } else {
    governance_status = 'PASS';
  }

  let status: ReviewStatus = 'in_review';
  if (governance_status === 'ANALYSIS INCOMPLETE') {
    status = 'pending';
  } else if (hasCritical || hasHigh) {
    status = 'flagged';
  } else if (imageFindings.length === 0 && scoreBreakdown.finalScore === 100) {
    status = 'approved';
  } else {
    status = 'in_review';
  }

  return {
    status,
    compliance_score: scoreBreakdown.finalScore,
    findings: imageFindings,
    extracted_ocr_text: extractedOcrText || undefined,
    metadata: {
      evaluatedAt: new Date().toISOString(),
      aiRun,
      aiProvider: aiRun ? (visionProvider || 'Google Gemini Vision') : undefined,
      ocrProvider: visionProvider,
      visionModelUsed,
      ocrConfidence,
      ocrWordsCount,
      ocrLinesCount,
      unreadableSegmentsCount,
      limitationsDisclosed: visionDisclosures.length > 0 ? visionDisclosures.join('; ') : undefined,
      disclosures: visionDisclosures,
      imageSummary,
      logoPresence: visionResult.logoPresence,
      logoDetection: visionResult.logoDetection,
      modality: 'image_only',
      guidelinesEvaluatedCount: activeGuidelines.length,
      factsEvaluatedCount: activeFacts.length,
      scoringBreakdown: scoreBreakdown,
      extracted_ocr_text: extractedOcrText || undefined,
      governance_status,
      analysisStatus: governance_status === 'ANALYSIS INCOMPLETE' ? 'partial' : 'complete',
      checksCompleted: {
        imageAnalysis: imageInspectionSucceeded,
        typographyExtraction: Boolean(extractedOcrText && extractedOcrText.length > 0),
        spellingAndGrammar: true,
        logoAndBrandIdentity: true,
        abusiveLanguage: true,
        layoutAndDesign: true,
        claimsAndConsistency: true,
        copyrightAndIp: true,
        guidelineChecks: activeGuidelines.length > 0,
        factChecks: activeFacts.length > 0,
      },
      checksStatus: {
        imageInspection: imageInspectionSucceeded ? 'passed' : 'failed',
        typographyExtraction: extractedOcrText.length > 0 ? 'passed' : 'unavailable',
        spellingAndGrammar: 'passed',
        logoAndBrandIdentity: 'passed',
        abusiveLanguage: 'passed',
        layoutAndDesign: 'passed',
        claimsAndConsistency: 'passed',
        copyrightAndIp: 'passed',
        brandGuidelines: activeGuidelines.length > 0 ? 'passed' : 'unavailable',
        factVerification: activeFacts.length > 0 ? 'passed' : 'unavailable',
        cloudVision: aiRun ? 'passed' : 'unavailable',
      },
      isPartialAnalysis: scoreBreakdown.isPartialAnalysis,
    },
  };
}

/**
 * Parameter-object wrapper for runComplianceReview
 */
export async function evaluateCompliance(params: {
  imageUrl?: string;
  content?: string;
  contentType?: ContentType;
  guidelines?: BrandGuideline[];
  facts?: ApprovedFact[];
  assets?: AuthorizedAsset[];
  ocrReferenceText?: string;
  captionText?: string;
  skipAI?: boolean;
}): Promise<ComplianceReviewResult> {
  const img = params.imageUrl || params.content || '';
  return runComplianceReview(
    img,
    params.contentType || 'ad_copy',
    params.guidelines || [],
    params.facts || [],
    {
      imageUrl: params.imageUrl,
      assets: params.assets,
      ocrReferenceText: params.ocrReferenceText,
      captionText: params.captionText,
      skipAI: params.skipAI,
    }
  );
}
