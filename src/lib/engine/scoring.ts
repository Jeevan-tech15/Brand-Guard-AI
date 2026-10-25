import { RuleSeverity } from '@/lib/types';
import { EngineFinding, ScoreBreakdown, ScoreDeduction } from './types';

const SEVERITY_WEIGHTS: Record<RuleSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

export interface ScoringContextOptions {
  hasImageInput?: boolean;
  hasCaptionInput?: boolean;
  extractedOcrText?: string;
  checksCompleted?: {
    imageAnalysis: boolean;
    captionAnalysis: boolean;
    crossModalComparison: boolean;
    guidelineChecks: boolean;
    factChecks: boolean;
  };
}

export function calculateComplianceScore(
  findings: EngineFinding[],
  context?: ScoringContextOptions
): ScoreBreakdown {
  const baseScore = 100;
  const deductions: ScoreDeduction[] = [];

  const counts: Record<RuleSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  // Check whether analysis was partial or incomplete
  const hasImage = Boolean(context?.hasImageInput);
  const hasCaption = Boolean(context?.hasCaptionInput);
  const ocrLength = (context?.extractedOcrText || '').trim().length;

  let isPartialAnalysis = false;
  let partialReason = '';

  const imageCheckFailed = hasImage && context?.checksCompleted && context.checksCompleted.imageAnalysis === false;

  // If image analysis failed or was inaccessible
  if (imageCheckFailed) {
    isPartialAnalysis = true;
    partialReason =
      'Analysis is incomplete: The creative image was inaccessible or failed server-side inspection. Automated visual checks could not complete.';
  } else if (hasImage && ocrLength === 0 && !hasCaption) {
    // If image was provided but no readable text was extracted AND no caption was provided
    isPartialAnalysis = true;
    partialReason =
      'Analysis is incomplete: The uploaded creative image contained no decipherable typography, and no accompanying caption copy was provided. Automated rule verification could not run.';
  } else if (hasImage && ocrLength === 0 && hasCaption) {
    isPartialAnalysis = true;
    partialReason =
      'Partial analysis: Accompanying caption was audited against brand guidelines, but no legible typography was extracted from the creative image.';
  }

  // Deduplicate overlapping findings (same evidence snippet & same category)
  const processedKeys = new Set<string>();

  for (const finding of findings) {
    const evidenceKey = `${finding.category}:${(finding.evidence_text || '').toLowerCase().trim()}`;

    if (finding.evidence_text && processedKeys.has(evidenceKey)) {
      continue; // Skip duplicate deduction for identical snippet and category
    }

    if (finding.evidence_text) {
      processedKeys.add(evidenceKey);
    }

    const penalty = SEVERITY_WEIGHTS[finding.severity] || 5;
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;

    deductions.push({
      severity: finding.severity,
      points: penalty,
      reason: `${finding.severity.toUpperCase()} finding: ${finding.finding_title}`,
      findingTitle: finding.finding_title,
    });
  }

  const totalDeductions = deductions.reduce((acc, curr) => acc + curr.points, 0);

  // If analysis was completely unable to run or is partial with 0 findings, score cannot be 100
  let finalScore: number | null;
  if (hasImage && (ocrLength === 0 || imageCheckFailed) && !hasCaption) {
    finalScore = 0; // Incomplete review with no text input cannot claim compliance
  } else if (isPartialAnalysis && totalDeductions === 0) {
    finalScore = null; // Incomplete review with zero findings cannot award 100%
  } else {
    finalScore = Math.max(0, baseScore - totalDeductions);
  }

  const methodology = isPartialAnalysis
    ? `Documented compliance policy: ${partialReason} Deductions: Critical (-25), High (-15), Medium (-8), Low (-3). Zero findings does not imply compliance when required modality checks could not execute.`
    : 'Deterministic scoring begins at 100 baseline points. Documented deductions are assessed per distinct finding: Critical (-25), High (-15), Medium (-8), Low (-3). Critical contradictions cap maximum score at 50%. Overlapping findings targeting identical text snippets are deduplicated to ensure reproducible evaluation.';

  const disclaimer =
    'Rule-based compliance score calculated from active brand guidelines and verified factual claims. This metric is an automated governance aid and does not constitute a legal, regulatory, or commercial guarantee.';

  return {
    baseScore,
    totalDeductions,
    finalScore,
    deductionsBySeverity: counts,
    deductions,
    methodology,
    disclaimer,
    isPartialAnalysis,
  };
}
