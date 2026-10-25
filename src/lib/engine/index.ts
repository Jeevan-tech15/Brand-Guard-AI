import { BrandGuideline, ApprovedFact, AuthorizedAsset, ContentType, ReviewStatus, ImageSummaryStats, BoundingBox } from '@/lib/types';
import { runDeterministicChecks, runSpellingAndGrammarChecks } from './deterministic';
import { runFactChecks } from './fact-checker';
import { runAIEvaluation } from './ai-evaluator';
import { runVisionAnalysis } from './vision-analyzer';
import { runCrossModalChecks, checkInternalImageConflicts } from './cross-modal';
import { calculateComplianceScore } from './scoring';
import { ComplianceReviewResult, EngineFinding } from './types';

export * from './types';
export * from './deterministic';
export * from './fact-checker';
export * from './cross-modal';
export * from './ai-evaluator';
export * from './vision-analyzer';
export * from './scoring';

export async function runComplianceReview(
  content: string,
  contentType: ContentType,
  guidelines: BrandGuideline[],
  facts: ApprovedFact[],
  options?: {
    skipAI?: boolean;
    imageUrl?: string;
    captionText?: string;
    assets?: AuthorizedAsset[];
    ocrReferenceText?: string;
  }
): Promise<ComplianceReviewResult> {
  const activeGuidelines = guidelines.filter((g) => g.is_active);
  const activeFacts = facts.filter((f) => f.is_active);
  const activeAssets = (options?.assets || []).filter((a) => a.is_active);

  const rawContent = content.trim();
  const captionCandidate = options?.captionText !== undefined
    ? options.captionText.trim()
    : (rawContent.startsWith('[Marketing Post Image:') ? '' : rawContent);
  const captionText = captionCandidate;
  const hasImage = Boolean(options?.imageUrl || options?.ocrReferenceText);
  const hasCaption = Boolean(captionText && captionText.length > 0);
  const modality: 'multimodal' | 'image_only' | 'text_only' =
    hasImage && hasCaption ? 'multimodal' : hasImage ? 'image_only' : 'text_only';

  // =================================================================
  // STAGE 1: IMAGE-ONLY INDEPENDENT AUDIT
  // =================================================================
  let imageFindings: EngineFinding[] = [];
  let extractedOcrText = '';
  let visionRun = false;
  let visionModelUsed: string | undefined = undefined;
  let visionProvider: string | undefined = undefined;
  let ocrConfidence: number | null = null;
  let ocrWordsCount = 0;
  let ocrLinesCount = 0;
  let unreadableSegmentsCount = 0;
  let imageSummary: ImageSummaryStats | null = null;
  let imageInspectionSucceeded = false;
  const visionDisclosures: string[] = [];
  let detectedBoundingBoxes: Array<{ text: string; confidence: number; bbox: BoundingBox }> = [];

  if (hasImage) {
    const visionResult = await runVisionAnalysis({
      imageUrl: options?.imageUrl || '',
      captionText,
      guidelines: activeGuidelines,
      facts: activeFacts,
      assets: activeAssets,
      ocrReferenceText: options?.ocrReferenceText,
    });

    visionRun = visionResult.visionRun;
    visionModelUsed = visionResult.model;
    visionProvider = visionResult.provider;
    extractedOcrText = visionResult.extracted_ocr_text;
    ocrConfidence = visionResult.ocrConfidence ?? null;
    ocrWordsCount = visionResult.ocrWordsCount ?? 0;
    ocrLinesCount = visionResult.ocrLinesCount ?? 0;
    unreadableSegmentsCount = visionResult.unreadableSegmentsCount ?? 0;
    imageSummary = visionResult.imageSummary ?? null;
    detectedBoundingBoxes = visionResult.boundingBoxes ?? [];
    visionDisclosures.push(...visionResult.disclosures);
    if (visionResult.reason && !visionResult.visionRun) {
      visionDisclosures.push(visionResult.reason);
    }
    imageInspectionSucceeded = Boolean(
      visionResult.imageSummary || visionResult.extracted_ocr_text || visionResult.provider
    );

    // Findings directly produced by vision analyzer
    imageFindings.push(...visionResult.findings);

    // If cloud multimodal vision was NOT executed (local OCR mode), run independent Image-Only checks:
    if (!visionResult.visionRun && extractedOcrText) {
      // 1a. Visible spelling and grammar errors in image typography
      const imgSpelling = runSpellingAndGrammarChecks(extractedOcrText, 'image');
      imageFindings.push(...imgSpelling);

      // 1b. Conflicting claims within the creative image itself
      const internalImageConflicts = checkInternalImageConflicts(extractedOcrText);
      imageFindings.push(...internalImageConflicts);

      // 1c. Deterministic brand guidelines on image text
      const { findings: imgDetFindings } = runDeterministicChecks(
        extractedOcrText,
        contentType,
        activeGuidelines,
        { targetScope: 'image' }
      );
      imageFindings.push(...imgDetFindings);

      // 1d. Product claims and factual assertions on image text
      const { findings: imgFactFindings } = runFactChecks(
        extractedOcrText,
        activeFacts,
        { sourceTag: 'image' }
      );
      imageFindings.push(...imgFactFindings);
    }
  }

  // Ensure all image findings are strictly tagged
  imageFindings = imageFindings.map((f) => ({
    ...f,
    target_scope: 'image' as const,
    source: f.source === 'vision_model' ? 'vision_model' : 'image',
  }));

  // =================================================================
  // STAGE 2: CAPTION-ONLY INDEPENDENT AUDIT (Runs even with no image)
  // =================================================================
  let captionFindings: EngineFinding[] = [];
  let unsupportedRuleTypes: string[] = [];

  if (hasCaption) {
    // 2a. Deterministic brand rules on caption copy
    const { findings: capDetFindings, unsupportedRuleTypes: unsupp } = runDeterministicChecks(
      captionText,
      contentType,
      activeGuidelines,
      { targetScope: 'caption' }
    );
    unsupportedRuleTypes = unsupp;
    captionFindings.push(...capDetFindings);

    // 2b. Caption spelling and grammar check
    const capSpelling = runSpellingAndGrammarChecks(captionText, 'caption');
    captionFindings.push(...capSpelling);

    // 2c. Fact checking and unsupported claims on caption copy
    const { findings: capFactFindings } = runFactChecks(
      captionText,
      activeFacts,
      { sourceTag: 'caption' }
    );
    captionFindings.push(...capFactFindings);
  }

  // Ensure all caption findings are strictly tagged
  captionFindings = captionFindings.map((f) => ({
    ...f,
    target_scope: 'caption' as const,
    source: f.source || 'caption',
  }));

  // =================================================================
  // STAGE 3: CROSS-MODAL AUDIT (Only runs after both Stages 1 & 2 complete)
  // =================================================================
  let crossModalFindings: EngineFinding[] = [];
  if (hasImage && hasCaption && extractedOcrText && captionText) {
    const cmResult = runCrossModalChecks(extractedOcrText, captionText);
    crossModalFindings = cmResult.findings.map((f) => ({
      ...f,
      target_scope: 'both' as const,
      category: 'cross_modal_conflict',
      source: 'cross_modal' as const,
    }));
  }

  // 6. Run AI Text Evaluation if enabled and configured (when not already run by vision)
  let aiRun = false;
  let aiProvider: string | undefined = undefined;
  let aiLimitations: string | undefined = undefined;
  let aiFindings: EngineFinding[] = [];

  const isRealVisionAi = Boolean(visionRun && visionModelUsed && visionModelUsed.includes('gemini'));

  const combinedText = [captionText, extractedOcrText].filter(Boolean).join('\n\n');

  if (isRealVisionAi) {
    aiRun = true;
    aiProvider = visionModelUsed || 'Google Gemini Vision';
  } else if (!options?.skipAI && combinedText.trim().length > 0) {
    const aiResult = await runAIEvaluation(combinedText, activeGuidelines, activeFacts);
    aiRun = aiResult.aiRun;
    aiProvider = aiResult.provider;
    aiLimitations = aiResult.reason;
    aiFindings = aiResult.findings.map(f => ({
      ...f,
      target_scope: f.target_scope || (captionText && f.evidence_text && captionText.includes(f.evidence_text) ? 'caption' : 'image')
    }));
  } else if (options?.skipAI) {
    aiLimitations = 'AI contextual evaluation explicitly bypassed by request options.';
  } else {
    aiRun = false;
    aiProvider = undefined;
    aiLimitations = visionProvider
      ? `Typography extracted via ${visionProvider}. Cloud AI Vision provider not configured.`
      : 'Cloud AI provider not configured in environment.';
  }

  // Combine limitations and disclosures
  const allDisclosures = [...visionDisclosures];
  if (unsupportedRuleTypes.length > 0) {
    allDisclosures.push(`Rule types deferred to human review: ${unsupportedRuleTypes.join(', ')}`);
  }
  if (aiLimitations) {
    allDisclosures.push(aiLimitations);
  }

  // 7. Merge and Deduplicate Findings from all three independent stages
  const allFindings = mergeAndDeduplicateFindings(
    crossModalFindings,
    captionFindings,
    imageFindings,
    aiFindings
  );

  // 7b. Correlate local OCR line bounding boxes to findings when bounding boxes are missing
  if (detectedBoundingBoxes.length > 0) {
    for (const finding of allFindings) {
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

  // 8. Calculate Documented Compliance Score
  const scoreBreakdown = calculateComplianceScore(allFindings, {
    hasImageInput: hasImage,
    hasCaptionInput: hasCaption,
    extractedOcrText,
    checksCompleted: {
      imageAnalysis: imageInspectionSucceeded,
      captionAnalysis: hasCaption,
      crossModalComparison: Boolean(extractedOcrText && captionText),
      guidelineChecks: activeGuidelines.length > 0,
      factChecks: activeFacts.length > 0,
    },
  });

  // 9. Determine Resulting Governance Status
  // Automated engine must never auto-approve content. Zero automated violations transitions
  // content to 'in_review' awaiting explicit reviewer signoff.
  let status: ReviewStatus = 'in_review';
  const hasCritical = allFindings.some((f) => f.severity === 'critical');
  const hasHigh = allFindings.some((f) => f.severity === 'high');

  if (hasCritical || hasHigh) {
    status = 'flagged';
  } else {
    // 0 violations or minor warnings: ready for human reviewer signoff
    status = 'in_review';
  }

  return {
    status,
    compliance_score: scoreBreakdown.finalScore,
    findings: allFindings,
    extracted_ocr_text: extractedOcrText || undefined,
    metadata: {
      evaluatedAt: new Date().toISOString(),
      aiRun,
      aiProvider: aiRun ? (aiProvider || 'Google Gemini Vision') : undefined,
      ocrProvider: visionProvider,
      visionModelUsed,
      ocrConfidence,
      ocrWordsCount,
      ocrLinesCount,
      unreadableSegmentsCount,
      limitationsDisclosed: allDisclosures.length > 0 ? allDisclosures.join('; ') : undefined,
      disclosures: allDisclosures,
      imageSummary,
      modality,
      guidelinesEvaluatedCount: activeGuidelines.length,
      factsEvaluatedCount: activeFacts.length,
      scoringBreakdown: scoreBreakdown,
      extracted_ocr_text: extractedOcrText || undefined,
      checksCompleted: {
        imageAnalysis: imageInspectionSucceeded,
        captionAnalysis: hasCaption,
        crossModalComparison: Boolean(extractedOcrText && captionText),
        guidelineChecks: activeGuidelines.length > 0,
        factChecks: activeFacts.length > 0,
      },
      checksStatus: {
        imageInspection: imageInspectionSucceeded ? 'passed' : hasImage ? 'failed' : 'unavailable',
        typographyExtraction: extractedOcrText.length > 0 ? 'passed' : hasImage ? 'unavailable' : 'unavailable',
        crossModal: Boolean(extractedOcrText && captionText) ? 'passed' : 'unavailable',
        brandGuidelines: activeGuidelines.length > 0 ? 'passed' : 'unavailable',
        factVerification: activeFacts.length > 0 ? 'passed' : 'unavailable',
        cloudVision: isRealVisionAi ? 'passed' : 'unavailable',
      },
      isPartialAnalysis: scoreBreakdown.isPartialAnalysis,
    },
  };
}

function mergeAndDeduplicateFindings(
  crossModal: EngineFinding[],
  caption: EngineFinding[],
  image: EngineFinding[],
  ai: EngineFinding[]
): EngineFinding[] {
  const merged: EngineFinding[] = [];
  const seenSignatures = new Set<string>();

  // Prioritize findings: cross-modal conflicts > caption/image independent findings > AI
  const list = [...crossModal, ...caption, ...image, ...ai];

  for (const item of list) {
    const evidenceKey = (item.evidence_text || item.finding_title).toLowerCase().trim();
    const sig = `${item.category}:${item.target_scope || 'all'}:${evidenceKey}`;

    if (evidenceKey && seenSignatures.has(sig)) {
      continue;
    }

    if (evidenceKey) {
      seenSignatures.add(sig);
    }

    merged.push(item);
  }

  return merged;
}
