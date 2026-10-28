import { BrandGuideline, ContentType, RuleConfiguration, EvaluatedRuleSnapshot } from '@/lib/types';
import { EngineFinding } from './types';

export function runDeterministicChecks(
  content: string,
  contentType: ContentType,
  guidelines: BrandGuideline[],
  options?: {
    targetScope?: 'caption' | 'image';
  }
): { findings: EngineFinding[]; unsupportedRuleTypes: string[]; evaluatedRules: EvaluatedRuleSnapshot[] } {
  const findings: EngineFinding[] = [];
  const unsupportedRuleTypes: string[] = [];
  const evaluatedRules: EvaluatedRuleSnapshot[] = [];
  const normalizedContent = content.trim();
  const lowerContent = normalizedContent.toLowerCase();
  const targetScope: 'caption' | 'image' = options?.targetScope || 'image';
  const sourceName = 'image';

  const activeRules = guidelines.filter((g) => g.is_active);

  // -------------------------------------------------------------
  // 0. Explicit Brand Rule Conflict Detection
  // Detect direct policy contradictions between saved rules
  // -------------------------------------------------------------
  for (let i = 0; i < activeRules.length; i++) {
    for (let j = i + 1; j < activeRules.length; j++) {
      const rA = activeRules[i];
      const rB = activeRules[j];
      const configA: RuleConfiguration = rA.rule_configuration || {};
      const configB: RuleConfiguration = rB.rule_configuration || {};

      const prohibitedA = new Set([
        ...(configA.keywords || []),
        ...(configA.forbidden_examples || []),
      ].map((s) => s.toLowerCase().trim()).filter(Boolean));

      const requiredB = new Set([
        ...(configB.required_phrases || []),
        ...(configB.allowed_examples || []),
      ].map((s) => s.toLowerCase().trim()).filter(Boolean));

      const prohibitedB = new Set([
        ...(configB.keywords || []),
        ...(configB.forbidden_examples || []),
      ].map((s) => s.toLowerCase().trim()).filter(Boolean));

      const requiredA = new Set([
        ...(configA.required_phrases || []),
        ...(configA.allowed_examples || []),
      ].map((s) => s.toLowerCase().trim()).filter(Boolean));

      // Check if A prohibits something B mandates or vice-versa
      let conflictingTerm: string | null = null;
      for (const term of prohibitedA) {
        if (requiredB.has(term)) {
          conflictingTerm = term;
          break;
        }
      }
      if (!conflictingTerm) {
        for (const term of prohibitedB) {
          if (requiredA.has(term)) {
            conflictingTerm = term;
            break;
          }
        }
      }

      if (conflictingTerm) {
        findings.push({
          category: 'brand_guideline',
          severity: 'high',
          finding_title: `Conflicting Brand Rules Detected: "${rA.title}" vs "${rB.title}"`,
          explanation: `Direct policy contradiction detected between "${rA.title}" and "${rB.title}". One rule prohibits the phrase "${conflictingTerm}" while another mandates its presence. Conflicting rules create ambiguous compliance states and must be reconciled.`,
          evidence_text: `Contradiction on term: "${conflictingTerm}"`,
          guideline_id: rA.id,
          confidence: 1.0,
          suggested_fix: `Reconcile the conflicting rules in Brand Guidelines so approved marketing copy is not subjected to contradictory requirements.`,
          source: 'deterministic_rule',
          verification_status: 'confirmed_violation',
          target_type: 'text',
          target_scope: 'image',
          resolution_status: 'unresolved',
        });
      }
    }
  }

  for (const rule of activeRules) {

    const config: RuleConfiguration =
      rule.rule_configuration ||
      (rule as unknown as { configuration?: RuleConfiguration }).configuration ||
      {};
    const ruleTitle = rule.title || (rule as unknown as { rule_name?: string }).rule_name || 'Brand Policy';
    const ruleDesc = rule.description || (rule as unknown as { rule_description?: string }).rule_description || '';
    const ruleType = (rule.rule_type || '').toLowerCase();

    switch (ruleType) {
      // -------------------------------------------------------------
      // 1. Prohibited Claims & Terms
      // -------------------------------------------------------------
      case 'prohibited_phrase':
      case 'prohibited_claim':
      case 'prohibited_term':
      case 'forbidden_words':
      case 'brand_safety': {
        const prohibitedList: string[] = [
          ...(config.keywords || []),
          ...(config.forbidden_examples || []),
        ];

        for (const term of prohibitedList) {
          if (!term || typeof term !== 'string') continue;
          const trimmedTerm = term.trim();
          if (trimmedTerm.length < 2) continue;

          const termRegex = new RegExp(`\\b${escapeRegExp(trimmedTerm)}\\b`, 'i');
          const match = normalizedContent.match(termRegex);

          if (match && match[0]) {
            const matchedText = match[0];
            const snippet = extractSurroundingSnippet(normalizedContent, match.index ?? 0, matchedText.length);

            findings.push({
              category: ruleType,
              severity: rule.severity || 'high',
              finding_title: `Prohibited Term Detected: "${matchedText}"`,
              explanation: `The phrase "${matchedText}" in ${targetScope} violates the policy "${ruleTitle}": ${ruleDesc}`,
              evidence_text: snippet,
              guideline_id: rule.id,
              confidence: 1.0,
              suggested_fix: config.allowed_examples?.[0]
                ? `Consider replacing with approved language: "${config.allowed_examples[0]}"`
                : `Remove or rephrase prohibited phrase "${matchedText}".`,
              source: sourceName,
              target_type: 'text',
              target_scope: targetScope,
              caption_evidence: targetScope === 'caption' ? matchedText : null,
              image_evidence: targetScope === 'image' ? matchedText : null,
              proposed_replacement: config.allowed_examples?.[0] || '',
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 2. Required Phrases & Disclaimers
      // -------------------------------------------------------------
      case 'required_disclaimer':
      case 'required_phrase': {
        const requiredPhrases: string[] = [
          ...(config.required_phrases || []),
          ...(config.allowed_examples || []),
        ];

        // Check if this disclaimer is triggered by specific keywords or always required
        const triggerKeywords: string[] = config.keywords || [];
        const isTriggered =
          triggerKeywords.length === 0 ||
          triggerKeywords.some((kw) => kw && lowerContent.includes(kw.toLowerCase()));

        if (isTriggered && requiredPhrases.length > 0) {
          const hasAnyRequiredPhrase = requiredPhrases.some((phrase) => {
            const trimmed = phrase.trim().toLowerCase();
            if (lowerContent.includes(trimmed)) return true;
            // Check individual sentences/clauses if phrase contains multiple statements
            const clauses = trimmed.split(/[.;]\s+/).map((c) => c.replace(/\.$/, '').trim()).filter((c) => c.length > 15);
            if (clauses.length > 0 && clauses.some((c) => lowerContent.includes(c))) return true;
            // Check standard trademark clause variation
            if (trimmed.includes('property of their respective owners') && lowerContent.includes('property of their respective owners')) {
              return true;
            }
            return false;
          });

          if (!hasAnyRequiredPhrase) {
            const expected = requiredPhrases[0];
            findings.push({
              category: 'required_disclaimer',
              severity: rule.severity || 'high',
              finding_title: `Missing Required Disclosure / Disclaimer: ${rule.title}`,
              explanation: `Content requires the mandatory disclosure statement for ${rule.title}. The required text was not found in the submitted copy.`,
              evidence_text: normalizedContent.slice(0, 120) + (normalizedContent.length > 120 ? '...' : ''),
              guideline_id: rule.id,
              confidence: 1.0,
              suggested_fix: `Append the required disclaimer: "${expected}"`,
              source: sourceName,
              target_type: 'text',
              target_scope: targetScope,
              caption_evidence: targetScope === 'caption' ? expected : null,
              image_evidence: targetScope === 'image' ? expected : null,
              proposed_replacement: expected,
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 3. Exact Slogans & Taglines
      // -------------------------------------------------------------
      case 'approved_slogan':
      case 'exact_slogan':
      case 'exact_phrase': {
        const exactSlogan = config.exact_slogan || config.allowed_examples?.[0];
        if (exactSlogan && typeof exactSlogan === 'string') {
          const sloganLower = exactSlogan.toLowerCase();
          // If content contains partial or mutated slogan without exact casing
          if (lowerContent.includes(sloganLower) && !normalizedContent.includes(exactSlogan)) {
            const matchIndex = lowerContent.indexOf(sloganLower);
            const actualUsed = normalizedContent.substring(matchIndex, matchIndex + exactSlogan.length);
            findings.push({
              category: 'exact_slogan',
              severity: rule.severity || 'medium',
              finding_title: `Improper Slogan Casing / Format: "${actualUsed}"`,
              explanation: `The approved corporate slogan must match the exact canonical capitalization and punctuation: "${exactSlogan}".`,
              evidence_text: actualUsed,
              guideline_id: rule.id,
              confidence: 0.95,
              suggested_fix: `Replace "${actualUsed}" with exact slogan: "${exactSlogan}"`,
              source: 'deterministic_rule',
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 4. Length & Formatting Limits
      // -------------------------------------------------------------
      case 'length_limit':
      case 'formatting_limits':
      case 'style_grammar': {
        const charCount = normalizedContent.length;
        const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length;

        // Custom config limits or channel defaults
        const maxChars: number | undefined =
          typeof config.max_characters === 'number'
            ? config.max_characters
            : contentType === 'social_media' && config.apply_channel_default
            ? 280
            : undefined;
        const minChars: number | undefined =
          typeof config.min_characters === 'number' ? config.min_characters : undefined;
        const maxWords: number | undefined =
          typeof config.max_words === 'number' ? config.max_words : undefined;

        if (typeof maxChars === 'number' && charCount > maxChars) {
          findings.push({
            category: 'length_limit',
            severity: rule.severity || 'medium',
            finding_title: `Character Limit Exceeded (${charCount} / ${maxChars} chars)`,
            explanation: `Content length of ${charCount} characters exceeds the configured limit of ${maxChars} characters for this channel.`,
            evidence_text: normalizedContent.slice(Math.max(0, maxChars - 30), Math.min(normalizedContent.length, maxChars + 40)),
            guideline_id: rule.id,
            confidence: 1.0,
            suggested_fix: `Shorten the copy by ${charCount - maxChars} characters to adhere to channel constraints.`,
            source: 'deterministic_rule',
          });
        }

        if (typeof minChars === 'number' && charCount < minChars) {
          findings.push({
            category: 'length_limit',
            severity: rule.severity || 'low',
            finding_title: `Content Below Minimum Length (${charCount} / ${minChars} chars)`,
            explanation: `Content has ${charCount} characters, below the required minimum of ${minChars} characters.`,
            evidence_text: normalizedContent,
            guideline_id: rule.id,
            confidence: 1.0,
            suggested_fix: `Expand on key product specifications to meet the minimum copy threshold.`,
            source: 'deterministic_rule',
          });
        }

        if (typeof maxWords === 'number' && wordCount > maxWords) {
          findings.push({
            category: 'length_limit',
            severity: rule.severity || 'medium',
            finding_title: `Word Count Exceeded (${wordCount} / ${maxWords} words)`,
            explanation: `Content contains ${wordCount} words, exceeding the limit of ${maxWords} words.`,
            evidence_text: normalizedContent.slice(0, 100) + '...',
            guideline_id: rule.id,
            confidence: 1.0,
            suggested_fix: `Trim verbose phrasing to stay under ${maxWords} words.`,
            source: 'deterministic_rule',
          });
        }

        // Formatting check: excessive punctuation (e.g. "!!!" or "???")
        const excessivePunctuationMatch = normalizedContent.match(/(!{2,}|\?{2,})/);
        if (excessivePunctuationMatch && excessivePunctuationMatch[0]) {
          findings.push({
            category: 'formatting_limits',
            severity: 'low',
            finding_title: `Excessive Punctuation: "${excessivePunctuationMatch[0]}"`,
            explanation: `Professional brand standards discourage repetitive punctuation marks in marketing copy.`,
            evidence_text: extractSurroundingSnippet(
              normalizedContent,
              excessivePunctuationMatch.index ?? 0,
              excessivePunctuationMatch[0].length
            ),
            guideline_id: rule.id,
            confidence: 0.95,
            suggested_fix: `Replace multiple punctuation with standard single punctuation.`,
            source: 'deterministic_rule',
          });
        }
        break;
      }

      // -------------------------------------------------------------
      // 5. Voice & Tone
      // -------------------------------------------------------------
      case 'voice_and_tone': {
        const forbiddenWords = [
          ...(config.forbidden_examples || []),
          ...(config.keywords || []),
        ];

        for (const word of forbiddenWords) {
          if (!word || typeof word !== 'string') continue;
          const wordRegex = new RegExp(`\\b${escapeRegExp(word.trim())}\\b`, 'i');
          const match = normalizedContent.match(wordRegex);

          if (match && match[0]) {
            const matchedWord = match[0];
            findings.push({
              category: 'voice_and_tone',
              severity: rule.severity || 'medium',
              finding_title: `Tone Inconsistency: "${matchedWord}"`,
              explanation: `Use of "${matchedWord}" conflicts with the voice policy "${rule.title}": ${rule.description}`,
              evidence_text: extractSurroundingSnippet(normalizedContent, match.index ?? 0, matchedWord.length),
              guideline_id: rule.id,
              confidence: 0.9,
              suggested_fix: config.allowed_examples?.[0]
                ? `Adopt recommended brand voice: "${config.allowed_examples[0]}"`
                : `Rephrase to maintain an authoritative, customer-focused tone.`,
              source: sourceName,
              target_type: 'text',
              target_scope: targetScope,
              caption_evidence: targetScope === 'caption' ? matchedWord : null,
              image_evidence: targetScope === 'image' ? matchedWord : null,
            });
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 6. Generic / Subjective Brand Guidelines
      // -------------------------------------------------------------
      default: {
        // If guideline defines keywords, evaluate presence against keywords
        const keywords = (config.keywords || config.forbidden_examples || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
        if (keywords.length > 0) {
          for (const kw of keywords) {
            const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
            const match = normalizedContent.match(kwRegex);
            if (match && match[0]) {
              findings.push({
                category: 'brand_guideline',
                severity: rule.severity || 'medium',
                finding_title: `Brand Guideline Violation: ${rule.title}`,
                explanation: `Detected term "${match[0]}" violates brand standard "${rule.title}": ${rule.description}`,
                evidence_text: match[0],
                guideline_id: rule.id,
                confidence: 0.95,
                suggested_fix: `Remove or update "${match[0]}" to comply with brand guideline.`,
                source: 'deterministic_rule',
                verification_status: 'confirmed_violation',
                target_type: 'text',
                target_scope: 'image',
                resolution_status: 'unresolved',
              });
            }
          }
        }
        break;
      }
    }

    // Determine honest rule evaluation status: PASS, FAIL, or UNVERIFIABLE
    const ruleFindings = findings.filter((f) => f.guideline_id === rule.id);
    if (ruleFindings.length > 0) {
      evaluatedRules.push({
        id: rule.id,
        title: rule.title,
        rule_type: rule.rule_type,
        severity: rule.severity,
        status: 'FAIL',
        evidence: ruleFindings[0].evidence_text || ruleFindings[0].image_evidence || null,
        reason: ruleFindings[0].explanation,
      });
    } else {
      // If rule requires visual or textual evidence that is absent from canvas:
      const isPurelyTextRule = ['prohibited_phrase', 'prohibited_claim', 'prohibited_term', 'forbidden_words'].includes(rule.rule_type);
      const isDisclaimerRule = ['required_disclaimer', 'required_phrase'].includes(rule.rule_type);
      
      if (!normalizedContent && (isDisclaimerRule || rule.description.toLowerCase().includes('must include'))) {
        evaluatedRules.push({
          id: rule.id,
          title: rule.title,
          rule_type: rule.rule_type,
          severity: rule.severity,
          status: 'UNVERIFIABLE',
          reason: 'Unable to verify from image: creative contains no legible text or mandatory disclosure.',
        });
      } else if (isPurelyTextRule) {
        evaluatedRules.push({
          id: rule.id,
          title: rule.title,
          rule_type: rule.rule_type,
          severity: rule.severity,
          status: 'PASS',
          reason: 'No prohibited language detected in image copy.',
        });
      } else {
        evaluatedRules.push({
          id: rule.id,
          title: rule.title,
          rule_type: rule.rule_type,
          severity: rule.severity,
          status: 'PASS',
          reason: 'Compliant with active guideline standard.',
        });
      }
    }
  }

  return { findings, unsupportedRuleTypes, evaluatedRules };
}

// -------------------------------------------------------------
// Spelling and Grammar Engine (Independent inspection)
// -------------------------------------------------------------
const COMMON_SPELLING_MISTAKES: Record<string, string> = {
  guarentee: 'guarantee',
  guarenteed: 'guaranteed',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperately: 'separately',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  tommorrow: 'tomorrow',
  warenty: 'warranty',
  waranty: 'warranty',
  lauch: 'launch',
  lauching: 'launching',
  limted: 'limited',
  offical: 'official',
  complience: 'compliance',
  sponser: 'sponsor',
  succesful: 'successful',
  enviroment: 'environment',
  recomended: 'recommended',
  truely: 'truly',
  commited: 'committed',
  calender: 'calendar',
  priveledge: 'privilege',
  millenium: 'millennium',
  independant: 'independent',
};

export function runSpellingAndGrammarChecks(
  content: string,
  targetScope: 'caption' | 'image'
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  if (!content || !content.trim()) return findings;

  const normalized = content.trim();

  // 1. Check known objective spelling mistakes
  for (const [wrong, right] of Object.entries(COMMON_SPELLING_MISTAKES)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const actualWord = match[0];
      const isImage = targetScope === 'image';
      findings.push({
        category: 'spelling_and_grammar',
        severity: isImage ? 'medium' : 'low',
        finding_title: `Spelling Error in ${isImage ? 'Creative Typography' : 'Caption'}: "${actualWord}"`,
        explanation: `The word "${actualWord}" is misspelled. Marketing communications require verified correct spelling.`,
        evidence_text: actualWord,
        confidence: 0.95,
        suggested_fix: `Replace "${actualWord}" with "${right}".`,
        source: isImage ? 'image' : 'caption',
        verification_status: 'confirmed_violation',
        target_type: 'text',
        target_scope: targetScope,
        image_evidence: isImage ? actualWord : null,
        caption_evidence: !isImage ? actualWord : null,
        proposed_replacement: right,
        resolution_status: 'unresolved',
      });
    }
  }

  // 2. Check accidental duplicated consecutive words (e.g. "the the", "for for")
  const duplicateWordRegex = /\b(the|in|at|on|for|with|and|or|to|is|our|your|that|this)\s+\1\b/gi;
  let dupMatch: RegExpExecArray | null;
  while ((dupMatch = duplicateWordRegex.exec(normalized)) !== null) {
    const snippet = dupMatch[0];
    const isImage = targetScope === 'image';
    const singleWord = dupMatch[1];
    findings.push({
      category: 'spelling_and_grammar',
      severity: isImage ? 'medium' : 'low',
      finding_title: `Duplicate Word Detected: "${snippet}"`,
      explanation: `Repeated word "${snippet}" detected in ${isImage ? 'creative typography' : 'caption copy'}.`,
      evidence_text: snippet,
      confidence: 0.95,
      suggested_fix: `Remove the duplicated word: use single "${singleWord}".`,
      source: isImage ? 'image' : 'caption',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: targetScope,
      image_evidence: isImage ? snippet : null,
      caption_evidence: !isImage ? snippet : null,
      proposed_replacement: singleWord,
      resolution_status: 'unresolved',
    });
  }

  return findings;
}

// -------------------------------------------------------------
// Helper Utilities
// -------------------------------------------------------------
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSurroundingSnippet(text: string, startIndex: number, length: number): string {
  const windowSize = 35;
  const snippetStart = Math.max(0, startIndex - windowSize);
  const snippetEnd = Math.min(text.length, startIndex + length + windowSize);
  const prefix = snippetStart > 0 ? '...' : '';
  const suffix = snippetEnd < text.length ? '...' : '';
  return `${prefix}${text.substring(snippetStart, snippetEnd).trim()}${suffix}`;
}

