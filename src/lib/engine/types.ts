import { RuleSeverity, ReviewStatus, BoundingBox, ImageSummaryStats } from '@/lib/types';

export interface EngineFinding {
  category: string;
  severity: RuleSeverity;
  finding_title: string;
  explanation: string;
  evidence_text?: string;
  guideline_id?: string | null;
  fact_id?: string | null;
  asset_id?: string | null;
  confidence: number;
  suggested_fix?: string;
  source: 'deterministic_rule' | 'fact_check' | 'ai_evaluator' | 'vision_model' | 'cross_modal' | 'image' | 'caption' | 'rule';
  verification_status?: 'supported' | 'contradicted' | 'unverified' | 'confirmed_violation' | 'possible_inconsistency' | 'unverifiable';
  bounding_box?: BoundingBox | null;
  target_type?: 'text' | 'visual_element' | 'logo' | 'color' | 'layout';
  target_scope?: 'caption' | 'image' | 'both';
  caption_evidence?: string | null;
  image_evidence?: string | null;
  proposed_replacement?: string | null;
  resolution_status?: 'unresolved' | 'resolved' | 'overridden';
}

export interface ScoreDeduction {
  severity: RuleSeverity;
  points: number;
  reason: string;
  findingTitle: string;
}

export interface ScoreBreakdown {
  baseScore: number;
  totalDeductions: number;
  finalScore: number | null;
  deductionsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  deductions: ScoreDeduction[];
  methodology: string;
  disclaimer: string;
  isPartialAnalysis?: boolean;
}

export interface EngineMetadata {
  evaluatedAt: string;
  aiRun: boolean;
  aiProvider?: string;
  ocrProvider?: string;
  visionModelUsed?: string;
  ocrConfidence?: number | null;
  ocrWordsCount?: number | null;
  ocrLinesCount?: number | null;
  unreadableSegmentsCount?: number | null;
  limitationsDisclosed?: string;
  disclosures?: string[];
  imageSummary?: ImageSummaryStats | null;
  modality?: 'multimodal' | 'image_only' | 'text_only';
  checksCompleted?: {
    imageAnalysis: boolean;
    captionAnalysis: boolean;
    crossModalComparison: boolean;
    guidelineChecks: boolean;
    factChecks: boolean;
  };
  checksStatus?: {
    imageInspection: 'passed' | 'failed' | 'unavailable';
    typographyExtraction: 'passed' | 'failed' | 'unavailable';
    crossModal: 'passed' | 'failed' | 'unavailable';
    brandGuidelines: 'passed' | 'failed' | 'unavailable';
    factVerification: 'passed' | 'failed' | 'unavailable';
    cloudVision: 'passed' | 'failed' | 'unavailable';
  };
  guidelinesEvaluatedCount: number;
  factsEvaluatedCount: number;
  scoringBreakdown: ScoreBreakdown;
  extracted_ocr_text?: string;
  isPartialAnalysis?: boolean;
  analysisNotes?: string;
}

export interface ComplianceReviewResult {
  status: ReviewStatus;
  compliance_score: number | null;
  findings: EngineFinding[];
  metadata: EngineMetadata;
  extracted_ocr_text?: string;
}

