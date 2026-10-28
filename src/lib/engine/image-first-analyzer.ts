import {
  BrandGuideline,
  ApprovedFact,
  AuthorizedAsset,
  BoundingBox,
  ImageSummaryStats,
  LogoPresenceResult,
  LogoInspectionDetails,
} from '@/lib/types';
import { EngineFinding } from './types';
import { extractDiscountClaims, extractDurationClaims, extractPriceClaims, extractSpecClaims } from './cross-modal';
import { cleanAndNormalizeOcrText } from './vision-analyzer';
import { runDeterministicChecks } from './deterministic';
import { runFactChecks } from './fact-checker';

// -------------------------------------------------------------------
// 1. SPELLING AND TEXT ACCURACY
// -------------------------------------------------------------------
const MARKETING_SPELLING_DICTIONARY: Record<string, string> = {
  // Common typo examples from user requests and marketing creatives
  soelling: 'spelling',
  dtect: 'detect',
  exuisting: 'existing',
  gaurentee: 'guarantee',
  gaurenteed: 'guaranteed',
  guarenteed: 'guaranteed',
  guarentee: 'guarantee',
  garantee: 'guarantee',
  limted: 'limited',
  limeted: 'limited',
  disconut: 'discount',
  discout: 'discount',
  dicount: 'discount',
  doscount: 'discount',
  offfer: 'offer',
  offffers: 'offers',
  offr: 'offer',
  ofer: 'offer',
  warenty: 'warranty',
  waranty: 'warranty',
  warrenty: 'warranty',
  recieve: 'receive',
  recieved: 'received',
  recieving: 'receiving',
  seperate: 'separate',
  seperately: 'separately',
  seperation: 'separation',
  definately: 'definitely',
  definatly: 'definitely',
  definitly: 'definitely',
  untill: 'until',
  tommorrow: 'tomorrow',
  tomorow: 'tomorrow',
  recomended: 'recommended',
  recommened: 'recommended',
  recommed: 'recommend',
  truely: 'truly',
  commited: 'committed',
  comitted: 'committed',
  proteen: 'protein',
  protean: 'protein',
  protien: 'protein',
  priveledge: 'privilege',
  priviledge: 'privilege',
  independant: 'independent',
  succesful: 'successful',
  succesfully: 'successfully',
  sucessful: 'successful',
  enviroment: 'environment',
  enviorment: 'environment',
  millenium: 'millennium',
  calender: 'calendar',
  calandar: 'calendar',
  complience: 'compliance',
  lauch: 'launch',
  lauching: 'launching',
  launche: 'launch',
  sponser: 'sponsor',
  sponsership: 'sponsorship',
  supercede: 'supersede',
  alot: 'a lot',
  teh: 'the',
  adn: 'and',
  fro: 'for',
  wiht: 'with',
  waht: 'what',
  availabel: 'available',
  availible: 'available',
  avaliable: 'available',
  ocassion: 'occasion',
  occassion: 'occasion',
  acheive: 'achieve',
  acheived: 'achieved',
  beleive: 'believe',
  beleived: 'believed',
  delicous: 'delicious',
  deliciouss: 'delicious',
  organik: 'organic',
  natrual: 'natural',
  naturel: 'natural',
  nutricious: 'nutritious',
  nutritionus: 'nutritious',
  refun: 'refund',
  refound: 'refund',
  delivary: 'delivery',
  delivry: 'delivery',
  dilevery: 'delivery',
  shiping: 'shipping',
  shippin: 'shipping',
  specail: 'special',
  speical: 'special',
  perfict: 'perfect',
  perfact: 'perfect',
  amazng: 'amazing',
  amzing: 'amazing',
  amazin: 'amazing',
  exclusiv: 'exclusive',
  exlusive: 'exclusive',
  collecton: 'collection',
  colletion: 'collection',
  incredable: 'incredible',
  incredibile: 'incredible',
  powerfull: 'powerful',
  durabel: 'durable',
  durible: 'durable',
  unbeleivable: 'unbelievable',
  unbeliveable: 'unbelievable',
  satisfacion: 'satisfaction',
  satisfacton: 'satisfaction',
  ingrediants: 'ingredients',
  ingredents: 'ingredients',
  supliment: 'supplement',
  suplements: 'supplements',
  suppliment: 'supplement',
  qualitiy: 'quality',
  qualty: 'quality',
  premuim: 'premium',
  premeum: 'premium',
  inteligence: 'intelligence',
  inteligente: 'intelligent',
  writting: 'writing',
  foward: 'forward',
  mispelled: 'misspelled',
  mispelling: 'misspelling',
  goverment: 'government',
  buisness: 'business',
  busines: 'business',
  neccessary: 'necessary',
  necesary: 'necessary',
  peice: 'piece',
  weired: 'weird',
  cheep: 'cheap',
  authentik: 'authentic',
  authenic: 'authentic',
  certafied: 'certified',
  certfied: 'certified',
  experiance: 'experience',
  subcription: 'subscription',
  subcribe: 'subscribe',
  regester: 'register',
  registartion: 'registration',
  checkout: 'checkout',
  chekout: 'checkout',
  detais: 'details',
  detailes: 'details',
  addres: 'address',
  adress: 'address',
  custmer: 'customer',
  custmor: 'customer',
  servise: 'service',
  colaboration: 'collaboration',
  anouncment: 'announcement',
  celebrate: 'celebrate',
  celibrate: 'celebrate',
  aniversary: 'anniversary',
  absolutly: 'absolutely',
  alredy: 'already',
  begining: 'beginning',
  carreer: 'career',
  colleague: 'colleague',
  collegue: 'colleague',
  embarass: 'embarrass',
  existance: 'existence',
  familar: 'familiar',
  finaly: 'finally',
  foriegn: 'foreign',
  grammer: 'grammar',
  greatful: 'grateful',
  happend: 'happened',
  harrasment: 'harassment',
  heigth: 'height',
  imediately: 'immediately',
  incidently: 'incidentally',
  interupt: 'interrupt',
  knowlege: 'knowledge',
  maintainance: 'maintenance',
  managment: 'management',
  mischievious: 'mischievous',
  noticable: 'noticeable',
  occured: 'occurred',
  oppurtunity: 'opportunity',
  oportunity: 'opportunity',
  prefered: 'preferred',
  publically: 'publicly',
  realy: 'really',
  refered: 'referred',
  remeber: 'remember',
  resistence: 'resistance',
  rythm: 'rhythm',
  schedual: 'schedule',
  skedule: 'schedule',
  succede: 'succeed',
  suprise: 'surprise',
  tendancy: 'tendency',
  threshhold: 'threshold',
  twelth: 'twelfth',
  tyrany: 'tyranny',
  vaccum: 'vacuum',
  vehical: 'vehicle',
  visable: 'visible',
  whithout: 'without',
  yeild: 'yield',
  planing: 'planning',
  planin: 'planning',
  movments: 'moments',
  movemnts: 'moments',
  vaction: 'vacation',
  vacay: 'vacation',
  advanture: 'adventure',
  advenutre: 'adventure',
  memmories: 'memories',
  memorise: 'memories',
  sumer: 'summer',
  suumer: 'summer',
  explor: 'explore',
  destintion: 'destination',
  destnation: 'destination',
  journy: 'journey',
  travle: 'travel',
  traval: 'travel',
  sael: 'sale',
  frea: 'free',
  bset: 'best',
  dill: 'deal',
  svae: 'save',
  capp: 'cap',
  packk: 'pack',
  barz: 'bars',
  richh: 'rich',
  healty: 'healthy',
  helthy: 'healthy',
  nutriton: 'nutrition',
  enrgy: 'energy',
  pwer: 'power',
  fres: 'fresh',
  tatse: 'taste',
  chocholate: 'chocolate',
  choclate: 'chocolate',
  flavour: 'flavor',
  vanila: 'vanilla',
  snak: 'snack',
  snaks: 'snacks',
  diacount: 'discount',
  spellingg: 'spelling',
  limtedd: 'limited',
  makwe: 'make',
  iumages: 'images',
  eror: 'error',
  erors: 'errors',
  produt: 'product',
  prodcts: 'products',
  prodcut: 'product',
  qualiti: 'quality',
  gurantee: 'guarantee',
  discnt: 'discount',
  offerr: 'offer',
  recomendedd: 'recommended',
  availble: 'available',
  delicius: 'delicious',
  ingredent: 'ingredient',
  nutrishus: 'nutritious',
  packge: 'package',
  premm: 'premium',
  orgnic: 'organic',
  naturaly: 'naturally',
  guaranti: 'guarantee',
  servce: 'service',
  custmerr: 'customer',
  ordr: 'order',
  orderr: 'order',
  savngs: 'savings',
  savng: 'saving',
  clik: 'click',
  visitt: 'visit',
  bussiness: 'business',
  campain: 'campaign',
  promoton: 'promotion',
  promotoin: 'promotion',
  advertisment: 'advertisement',
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
  'aeropulse',
  'novapay',
  'instagram',
  'linkedin',
  'soc2',
  'iso27001',
  'consultbin',
  'nutrabite',
  'nike',
  'apple',
  'google',
  'meta',
  'adidas',
  'samsung',
]);

// Core reference vocabulary of standard commercial marketing words for typo distance detection
const COMMON_MARKETING_WORDS = [
  'guarantee', 'guaranteed', 'discount', 'warranty', 'limited', 'offer', 'special',
  'receive', 'received', 'separate', 'definitely', 'tomorrow', 'protein', 'delicious',
  'organic', 'natural', 'nutritious', 'delivery', 'shipping', 'quality', 'premium',
  'collection', 'exclusive', 'incredible', 'powerful', 'durable', 'unbelievable',
  'satisfaction', 'ingredients', 'supplement', 'business', 'experience', 'customer',
  'service', 'anniversary', 'edition', 'package', 'features', 'technology', 'design',
  'protect', 'performance', 'comfort', 'lightweight', 'wireless', 'battery', 'charge',
  'security', 'enterprise', 'reliability', 'certified', 'official', 'innovative',
  'solution', 'support', 'available', 'order', 'purchase', 'saving', 'savings',
  'sound', 'clarity', 'active', 'cancellation', 'playtime', 'device', 'devices',
  'terms', 'apply', 'results', 'vary', 'mega', 'sale', 'promo', 'stores',
  'supplies', 'combined', 'dock', 'ecosystem', 'power', 'generation', 'creators',
  'registered', 'trademark', 'preview', 'uptime', 'region', 'automated', 'automate', 'failover',
  'infrastructure', 'nutrition', 'fitness', 'plant', 'wheat', 'gluten', 'recyclable',
  'planning', 'moments', 'adventure', 'summer', 'travel', 'vacation', 'explore',
  'destination', 'memories', 'capture', 'world', 'hidden', 'starts', 'start', 'scale', 'vibes', 'journey',
  'pure', 'your', 'with', 'fuel', 'dock', 'mega', 'pack', 'live', 'time', 'free', 'save',
  'market', 'marketing', 'platform', 'creative', 'visual', 'compliance', 'workflow', 'workflows',
  'review', 'reviews', 'intelligence', 'trial', 'digital', 'work', 'cloud', 'system', 'systems'
];

function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (Math.abs(s1.length - s2.length) > 2) return 99;
  const len1 = s1.length;
  const len2 = s2.length;
  const d: number[][] = [];
  for (let i = 0; i <= len1; i++) d[i] = [i];
  for (let j = 0; j <= len2; j++) d[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[len1][len2];
}

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

  const flaggedWords = new Set<string>();

  // 1. Marketing spelling error detection via extensive dictionary
  for (const [wrong, right] of Object.entries(MARKETING_SPELLING_DICTIONARY)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const actualWord = match[0];
      const lowerWord = actualWord.toLowerCase();

      if (brandWhitelist.has(lowerWord) || flaggedWords.has(lowerWord)) continue;
      flaggedWords.add(lowerWord);

      const matchingBbox = boundingBoxes?.find((b) =>
        b.text.toLowerCase().includes(lowerWord)
      )?.bbox;

      findings.push({
        category: 'spelling_and_grammar',
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

  // 2. Algorithmic single-character edit distance typo detection (5+ characters)
  const tokens = normalized.match(/\b[a-zA-Z]{5,18}\b/g) || [];
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (
      brandWhitelist.has(lowerToken) ||
      flaggedWords.has(lowerToken) ||
      COMMON_MARKETING_WORDS.includes(lowerToken) ||
      MARKETING_SPELLING_DICTIONARY[lowerToken]
    ) {
      continue;
    }

    // Skip all-uppercase acronyms of <=5 chars
    if (token === token.toUpperCase() && token.length <= 5) continue;

    for (const validWord of COMMON_MARKETING_WORDS) {
      // Ignore valid regular inflections (plural -s/-es, past tense -ed/-d, participle -ing, adverb -ly)
      const isRegularInflection =
        (lowerToken.endsWith('s') && lowerToken.slice(0, -1) === validWord) ||
        (lowerToken.endsWith('es') && lowerToken.slice(0, -2) === validWord) ||
        (lowerToken.endsWith('ed') && lowerToken.slice(0, -2) === validWord) ||
        (lowerToken.endsWith('d') && lowerToken.slice(0, -1) === validWord) ||
        (lowerToken.endsWith('ing') && lowerToken.slice(0, -3) === validWord) ||
        (lowerToken.endsWith('ly') && lowerToken.slice(0, -2) === validWord);
      if (isRegularInflection) continue;

      const isReverseInflection =
        (validWord.endsWith('s') && validWord.slice(0, -1) === lowerToken) ||
        (validWord.endsWith('es') && validWord.slice(0, -2) === lowerToken) ||
        (validWord.endsWith('ed') && validWord.slice(0, -2) === lowerToken) ||
        (validWord.endsWith('d') && validWord.slice(0, -1) === lowerToken) ||
        (validWord.endsWith('ing') && validWord.slice(0, -3) === lowerToken) ||
        (validWord.endsWith('ly') && validWord.slice(0, -2) === lowerToken);
      if (isReverseInflection) continue;

      if (Math.abs(validWord.length - lowerToken.length) <= 1 && levenshteinDistance(lowerToken, validWord) === 1) {
        flaggedWords.add(lowerToken);
        const matchingBbox = boundingBoxes?.find((b) =>
          b.text.toLowerCase().includes(lowerToken)
        )?.bbox;

        findings.push({
          category: 'spelling_and_grammar',
          severity: 'medium',
          finding_title: `Likely Typo in Creative Typography: "${token}"`,
          explanation: `The term "${token}" appears to be a typo or misspelled variation of standard word "${validWord}". Unintended typos diminish ad effectiveness and brand authority.`,
          evidence_text: token,
          confidence: 0.9,
          suggested_fix: `Correct the spelling of "${token}" to "${validWord}".`,
          source: 'ocr_analysis',
          verification_status: 'confirmed_violation',
          target_type: 'text',
          target_scope: 'image',
          image_evidence: token,
          bounding_box: matchingBbox || null,
          proposed_replacement: validWord,
          resolution_status: 'unresolved',
          needs_human_verification: false,
        });
        break;
      }
    }
  }

  // 3. Duplicated words or figures (e.g. "50% 50%", "the the", "free free")
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
      category: 'spelling_and_grammar',
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

  // 4. Cut-off or dangling hyphenated words across line boundaries
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.match(/[a-zA-Z]{2,}-\s*$/) && !line.match(/\b(pre-|post-|non-|all-)\s*$/i)) {
      findings.push({
        category: 'spelling_and_grammar',
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

  // 5. Missing spaces between numbers/percentages/currency and marketing words (e.g. "50%OFF", "100%Organic", "$50Only")
  const missingSpaceRegex = /(?:^|\s|\b)(\$?\d+(?:%|\.\d+)?(?:OFF)?|\$\d+|(?:24\/7))([a-zA-Z]{3,})\b/gi;
  let spaceMatch: RegExpExecArray | null;
  while ((spaceMatch = missingSpaceRegex.exec(normalized)) !== null) {
    const rawSnippet = spaceMatch[0].trim();
    const prefix = spaceMatch[1];
    const word = spaceMatch[2];
    const fixed = `${prefix} ${word}`;

    const matchingBbox = boundingBoxes?.find((b) =>
      b.text.toLowerCase().includes(rawSnippet.toLowerCase())
    )?.bbox;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'low',
      finding_title: `Missing Space in Marketing Copy: "${rawSnippet}"`,
      explanation: `Missing whitespace separation between metric "${prefix}" and copy token "${word}". Proper spacing is required for professional visual legibility.`,
      evidence_text: rawSnippet,
      confidence: 0.95,
      suggested_fix: `Add a space: change "${rawSnippet}" to "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: rawSnippet,
      bounding_box: matchingBbox || null,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 6. Accidental double spaces between words
  const doubleSpaceRegex = /\b([a-zA-Z0-9]+)\s{2,}([a-zA-Z0-9]+)\b/g;
  let dSpaceMatch: RegExpExecArray | null;
  while ((dSpaceMatch = doubleSpaceRegex.exec(imageText)) !== null) {
    const snippet = dSpaceMatch[0];
    const w1 = dSpaceMatch[1];
    const w2 = dSpaceMatch[2];
    const fixed = `${w1} ${w2}`;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'low',
      finding_title: `Accidental Double Space in Copy: "${w1}  ${w2}"`,
      explanation: `Redundant whitespace detected between words "${w1}" and "${w2}". Multiple spaces indicate copy editing oversight.`,
      evidence_text: snippet,
      confidence: 0.9,
      suggested_fix: `Replace multiple spaces with a single space: "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: snippet,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 7. Rogue space before punctuation (e.g. "discount ," or "sale .")
  const spacePunctRegex = /\b([a-zA-Z0-9]+)\s+([,!?:;])/g;
  let sPunctMatch: RegExpExecArray | null;
  while ((sPunctMatch = spacePunctRegex.exec(normalized)) !== null) {
    const snippet = sPunctMatch[0];
    const word = sPunctMatch[1];
    const punct = sPunctMatch[2];
    const fixed = `${word}${punct}`;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'low',
      finding_title: `Rogue Space Before Punctuation: "${snippet}"`,
      explanation: `Improper whitespace placed before punctuation mark "${punct}". Punctuation should immediately follow the preceding word.`,
      evidence_text: snippet,
      confidence: 0.95,
      suggested_fix: `Remove the space: change "${snippet}" to "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: snippet,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 8. Double period typo (".." instead of single period or ellipsis)
  const doublePeriodRegex = /(?:[a-zA-Z0-9]+\s*|\b)\.\.(?!\.)/g;
  let dPeriodMatch: RegExpExecArray | null;
  while ((dPeriodMatch = doublePeriodRegex.exec(normalized)) !== null) {
    const snippet = dPeriodMatch[0].trim();
    findings.push({
      category: 'spelling_and_grammar',
      severity: 'low',
      finding_title: `Double Period Typo: ".." in Copy`,
      explanation: `Typographical error: accidental double period ".." detected. Use either a single period for sentence closure or an ellipsis "..." for continuation.`,
      evidence_text: snippet,
      confidence: 0.9,
      suggested_fix: `Replace ".." with a single period "."`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: snippet,
      proposed_replacement: snippet.replace('..', '.'),
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 9. Indefinite article errors (e.g. "a exclusive", "an unique")
  const articleAErrorRegex = /\b([Aa])\s+(exclusive|official|honest|amazing|incredible|extraordinary|authentic|unbeatable|unlimited|unbelievable|instant|elite|exceptional|unqiue|unreal|early|essential)\b/gi;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = articleAErrorRegex.exec(normalized)) !== null) {
    const raw = aMatch[0];
    const isCap = aMatch[1] === 'A';
    const targetWord = aMatch[2];
    const fixed = `${isCap ? 'An' : 'an'} ${targetWord}`;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'medium',
      finding_title: `Indefinite Article Grammatical Error: "${raw}"`,
      explanation: `Grammar rule violation: "${targetWord}" begins with a vowel sound and requires the article "${isCap ? 'An' : 'an'}" rather than "${aMatch[1]}".`,
      evidence_text: raw,
      confidence: 0.95,
      suggested_fix: `Change "${raw}" to "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: raw,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  const articleAnErrorRegex = /\b([Aa]n)\s+(unique|user|universal|one-time|European|uniform|useful|unit|yearly)\b/gi;
  let anMatch: RegExpExecArray | null;
  while ((anMatch = articleAnErrorRegex.exec(normalized)) !== null) {
    const raw = anMatch[0];
    const isCap = anMatch[1] === 'An';
    const targetWord = anMatch[2];
    const fixed = `${isCap ? 'A' : 'a'} ${targetWord}`;

    findings.push({
      category: 'spelling_and_grammar',
      severity: 'medium',
      finding_title: `Indefinite Article Grammatical Error: "${raw}"`,
      explanation: `Grammar rule violation: "${targetWord}" begins with a consonant 'y' sound and requires the article "${isCap ? 'A' : 'a'}" rather than "${anMatch[1]}".`,
      evidence_text: raw,
      confidence: 0.95,
      suggested_fix: `Change "${raw}" to "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: raw,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 10. Common homophone & contraction confusions (e.g. "your invited" vs "you're invited")
  const homophoneRegex = /\b(your)\s+(invited|welcome|approved|qualif\w+|selected|ready)\b/gi;
  let homoMatch: RegExpExecArray | null;
  while ((homoMatch = homophoneRegex.exec(normalized)) !== null) {
    const raw = homoMatch[0];
    const fixed = `you're ${homoMatch[2]}`;
    findings.push({
      category: 'spelling_and_grammar',
      severity: 'medium',
      finding_title: `Grammatical Homophone Error: "${raw}"`,
      explanation: `Confused contraction: "${raw}" should be written as "${fixed}" (short for "you are"). "Your" is possessive.`,
      evidence_text: raw,
      confidence: 0.92,
      suggested_fix: `Change "${raw}" to "${fixed}".`,
      source: 'ocr_analysis',
      verification_status: 'confirmed_violation',
      target_type: 'text',
      target_scope: 'image',
      image_evidence: raw,
      proposed_replacement: fixed,
      resolution_status: 'unresolved',
      needs_human_verification: false,
    });
  }

  // 11. Floating asterisk without disclaimer footnote
  // When an asterisk appears on an offer or claim, e.g. "50% OFF*", but no footnote is provided
  const hasAsteriskClaim = /[*]/g.test(normalized);
  if (hasAsteriskClaim) {
    const hasFootnoteExplanation =
      /\n\s*[*•·]\s*[a-zA-Z]{3,}/g.test(normalized) ||
      /\b(?:terms\s+and\s+conditions|terms\s+apply|conditions\s+apply|disclaimer|subject\s+to|valid\s+only)\b/i.test(normalized);

    if (!hasFootnoteExplanation) {
      findings.push({
        category: 'claims_and_consistency',
        severity: 'medium',
        finding_title: 'Floating Asterisk Without Footnote / Disclaimer',
        explanation: 'Marketing creative contains an asterisk ("*") attached to a promotional claim or headline, but no corresponding explanatory footnote or disclaimer terms appear on the image.',
        evidence_text: 'Floating asterisk claim without footnote',
        confidence: 0.90,
        suggested_fix: 'Add a small disclaimer footnote at the bottom of the creative clarifying the asterisk terms (e.g. "*Terms and conditions apply").',
        source: 'ocr_analysis',
        verification_status: 'confirmed_violation',
        target_type: 'text',
        target_scope: 'image',
        resolution_status: 'unresolved',
        needs_human_verification: false,
      });
    }
  }

  return findings;
}

// -------------------------------------------------------------------
// 2. LOGO AND BRAND IDENTITY
// -------------------------------------------------------------------
// -------------------------------------------------------------------
// 2. LOGO AND BRAND IDENTITY GOVERNANCE
// -------------------------------------------------------------------

export interface LogoAuditOptions {
  hasDetectedLogo?: boolean;
  brandName?: string;
  guidelines?: BrandGuideline[];
  contentType?: string;
  logoInspection?: Partial<LogoInspectionDetails>;
}

/**
 * Evaluates whether active brand guidelines explicitly mandate a logo for this creative.
 * If no guideline mandates a logo, the system will not invent a requirement or flag missing logos.
 */
export function evaluateLogoPolicyRequirements(
  guidelines: BrandGuideline[] = [],
  authorizedAssets: AuthorizedAsset[] = [],
  contentType?: string
): {
  isMandatory: boolean;
  reason?: string;
  guideline?: BrandGuideline;
  primaryLogo?: AuthorizedAsset;
} {
  const primaryLogo = authorizedAssets.find(
    (a) => a.is_active && a.asset_type === 'logo' && (a.asset_metadata?.is_primary || true)
  );

  const logoGuideline = guidelines.find((g) => {
    if (!g.is_active) return false;
    const ruleType = (g.rule_type || '').toLowerCase();
    const title = (g.title || '').toLowerCase();
    const desc = (g.description || '').toLowerCase();

    if (
      ruleType === 'logo_presence' ||
      ruleType === 'logo_usage' ||
      ruleType === 'mandatory_logo'
    ) {
      return true;
    }
    if (
      title.includes('require logo') ||
      title.includes('logo presence') ||
      title.includes('mandatory logo') ||
      title.includes('missing logo')
    ) {
      return true;
    }
    if (
      (desc.includes('must include') || desc.includes('always include') || desc.includes('required on all')) &&
      (desc.includes('logo') || desc.includes('brand mark') || desc.includes('watermark'))
    ) {
      return true;
    }
    if (g.rule_configuration?.require_logo === true) {
      return true;
    }
    return false;
  });

  return {
    isMandatory: Boolean(logoGuideline),
    reason: logoGuideline?.description || undefined,
    guideline: logoGuideline,
    primaryLogo,
  };
}

/**
 * Rigorously separates logo presence from logo identity and reference matching:
 * - PRESENT: recognizable logo, monogram, or brand mark is visible.
 * - PRESENT_UNVERIFIED: a likely logo or mark is visible, but cannot be confirmed against an official reference asset.
 * - MISSING: no recognizable logo or mark is visible, with sufficient visual evidence.
 * - UNCERTAIN: image quality, occlusion, size, or ambiguity prevents a reliable conclusion.
 */
export function inspectLogoPresenceAndIdentity(
  imageSummary: ImageSummaryStats | null,
  authorizedAssets: AuthorizedAsset[] = [],
  ocrText?: string,
  options?: LogoAuditOptions
): {
  presence: LogoPresenceResult;
  details: LogoInspectionDetails;
  findings: EngineFinding[];
} {
  const findings: EngineFinding[] = [];
  const policy = evaluateLogoPolicyRequirements(options?.guidelines, authorizedAssets, options?.contentType);
  const primaryLogo = policy.primaryLogo;

  const cleanText = ocrText ? cleanAndNormalizeOcrText(ocrText).toLowerCase() : '';

  // Extract known brand names from authorized assets, whitelist, or options
  const activeLogoAssets = authorizedAssets.filter((a) => a.is_active && a.asset_type === 'logo');
  const knownBrandNames = [
    ...Array.from(DEFAULT_BRAND_WHITELIST),
    ...(options?.brandName ? [options.brandName.toLowerCase()] : []),
    ...activeLogoAssets
      .map((a) => a.asset_name.toLowerCase().replace(/official\s*logo/i, '').replace(/logo/i, '').trim())
      .filter((n) => n.length >= 2),
  ];

  const hasBrandNameMention = knownBrandNames.some((name) => cleanText.includes(name));

  // Extract brand signifier words and prominent brand wordmark candidates
  const brandSignifiers = [
    'digital work', 'digital', 'brand', 'studio', 'studios', 'platform', 'technologies',
    'labs', 'agency', 'media', 'solutions', 'enterprises', 'app', 'corp',
    'inc', 'co', 'group', 'company', 'network', 'creative', 'ventures',
    'consultbin', 'nutrabite', 'soundzen', 'voltmax', 'cloudnova', 'hyperion',
    'vitalpulse', 'aethelgard', 'purevita', 'apexwealth', 'wanderluxe',
  ];
  const ocrLines = (ocrText || '').split('\n').map((l) => l.trim()).filter((l) => l.length >= 2);
  
  // Find any candidate line that looks like a brand name or header/footer wordmark
  const brandCandidateLine = ocrLines.find((l) => {
    if (l.length < 2 || l.length > 40) return false;
    const low = l.toLowerCase();
    if (/^(flash|sale|discount|off|shop|buy|click|limited|warning|caution|terms|apply|free|save|get|order|call|price)\b/i.test(l)) {
      return false;
    }
    if (knownBrandNames.some((bn) => low.includes(bn))) return true;
    if (brandSignifiers.some((sig) => low.includes(sig))) return true;
    if (/^[A-Z0-9\s&.\-']{2,30}$/.test(l) && !/[0-9]{5,}/.test(l)) return true;
    return false;
  }) || (ocrLines.length > 0 ? ocrLines[0] : '');

  const isBrandCandidateValid =
    brandCandidateLine.length >= 2 &&
    brandCandidateLine.length <= 40 &&
    !/^(flash|sale|discount|off|shop|buy|click|limited|warning|caution|terms|apply|free)/i.test(brandCandidateLine);

  const hasLikelyBrandWordmark = hasBrandNameMention || isBrandCandidateValid;

  // Determine presence
  let presence: LogoPresenceResult = 'UNCERTAIN';
  let detectedMark = options?.logoInspection?.detected_mark;
  let location = options?.logoInspection?.location;
  let confidence = options?.logoInspection?.confidence ?? 0.85;
  const matchesReference = options?.logoInspection?.matches_reference;
  const referenceNotes = options?.logoInspection?.reference_notes;

  if (options?.logoInspection?.presence) {
    presence = options.logoInspection.presence;
  } else if (options?.hasDetectedLogo === true) {
    // Logo mark visibly identified (e.g. from vision model or icon detector)
    if (primaryLogo && hasBrandNameMention) {
      presence = 'PRESENT';
      detectedMark = detectedMark || primaryLogo.asset_name;
    } else {
      // Mark is visible, but authentic corporate identity is unverified against a reference
      presence = 'PRESENT_UNVERIFIED';
      detectedMark = detectedMark || (isBrandCandidateValid ? brandCandidateLine : 'Visible brand mark / emblem');
      location = location || (isBrandCandidateValid ? 'header / canvas' : 'canvas');
    }
  } else if (hasLikelyBrandWordmark) {
    if (primaryLogo && hasBrandNameMention) {
      presence = 'PRESENT';
      detectedMark = detectedMark || primaryLogo.asset_name;
    } else {
      presence = 'PRESENT_UNVERIFIED';
      detectedMark = detectedMark || (isBrandCandidateValid ? brandCandidateLine : (hasBrandNameMention ? 'Detected brand wordmark' : 'Detected brand mark / attribution'));
      location = location || 'header / canvas';
    }
  } else if (options?.hasDetectedLogo === false) {
    // Explicitly verified absence from multimodal visual inspection across entire canvas
    if (imageSummary && (imageSummary.width || 0) >= 200 && (imageSummary.height || 0) >= 200) {
      presence = 'MISSING';
      confidence = 0.88;
    } else {
      presence = 'UNCERTAIN';
      confidence = 0.60;
    }
  } else {
    // In heuristic / local mode without explicit vision detector
    // An image may contain a pure graphical emblem or icon without readable text.
    // Therefore, do NOT assume MISSING when OCR cannot find a wordmark.
    presence = 'UNCERTAIN';
    confidence = 0.55;
  }

  // Build details
  const details: LogoInspectionDetails = {
    presence,
    detected_mark: detectedMark,
    location,
    bounding_box: options?.logoInspection?.bounding_box,
    confidence,
    is_identity_verified: presence === 'PRESENT',
    explanation: detectedMark
      ? `Logo/brand mark detected: ${detectedMark} (${location || 'canvas region'}).`
      : (presence === 'MISSING' ? 'Canvas visual inspection confirmed absence of brand logo or watermark.' : 'Logo presence evaluation completed.'),
    matches_reference: matchesReference,
    reference_notes: referenceNotes,
    evidence: detectedMark
      ? `Detected brand mark: "${detectedMark}" (${location || 'canvas region'})`
      : (presence === 'MISSING' ? 'Visual inspection of canvas confirmed absence of brand logo or watermark.' : 'Logo presence evaluation completed.'),
  };

  // 1. If logo is MISSING:
  // ONLY create a finding if active brand guidelines actually mandate a logo!
  if (presence === 'MISSING') {
    if (policy.isMandatory) {
      findings.push({
        category: 'logo_and_brand_identity',
        severity: policy.guideline?.severity || 'medium',
        finding_title: 'Missing Brand Logo on Marketing Creative / Product Post',
        explanation: `${policy.guideline?.title || 'Brand Policy'}: ${policy.reason || 'Active brand guidelines require a visible brand logo on marketing creatives.'} Full visual inspection of the canvas confirmed that no recognizable brand logo, monogram, or watermark is present.`,
        evidence_text: 'No brand logo or emblem detected on canvas',
        confidence,
        suggested_fix: 'Add your official brand logo in a prominent, uncluttered position (such as the top-left, top-right, or bottom corner) with adequate clear space and contrast.',
        source: 'image',
        verification_status: 'confirmed_violation',
        target_type: 'logo',
        target_scope: 'image',
        image_evidence: 'Canvas inspected; brand logo absent',
        guideline_id: policy.guideline?.id || null,
        resolution_status: 'unresolved',
        needs_human_verification: false,
      });
    }
    // If policy.isMandatory is false, do NOT invent a missing logo finding!
  } else if (presence === 'UNCERTAIN') {
    // If ambiguous and policy mandates logo, report for human verification with calibrated confidence
    if (policy.isMandatory) {
      findings.push({
        category: 'logo_and_brand_identity',
        severity: 'low',
        finding_title: 'Logo Presence Inconclusive / Verification Required',
        explanation: `Active brand guidelines require a brand logo, but image clarity, resolution, or occlusion prevents conclusive verification of the logo mark. Manual confirmation is recommended.`,
        evidence_text: 'Inconclusive logo mark visibility on canvas',
        confidence: Math.min(confidence, 0.60),
        suggested_fix: 'Ensure the brand logo is displayed with high resolution and sufficient contrast against the background.',
        source: 'image',
        verification_status: 'unverifiable',
        target_type: 'logo',
        target_scope: 'image',
        guideline_id: policy.guideline?.id || null,
        resolution_status: 'unresolved',
        needs_human_verification: true,
        human_verification_reason: 'Image resolution, occlusion, or background contrast prevents conclusive verification.',
      });
    }
  } else if (presence === 'PRESENT' || presence === 'PRESENT_UNVERIFIED') {
    // Logo is visible! Check if there is an actual reference mismatch
    if (primaryLogo && matchesReference === false) {
      findings.push({
        category: 'logo_and_brand_identity',
        severity: 'high',
        finding_title: 'Brand Logo Reference Mismatch',
        explanation: `Detected logo ("${detectedMark || 'Unapproved mark'}") conflicts with approved brand reference "${primaryLogo.asset_name}". ${referenceNotes || 'Using an unauthorized logo variant or third-party symbol compromises brand integrity.'}`,
        evidence_text: detectedMark || 'Mismatched logo mark on canvas',
        confidence: Math.max(0.80, confidence),
        suggested_fix: `Replace the unapproved mark with the official "${primaryLogo.asset_name}" asset from Brand Guidelines.`,
        source: 'image',
        verification_status: 'confirmed_violation',
        target_type: 'logo',
        target_scope: 'image',
        image_evidence: detectedMark,
        asset_id: primaryLogo.id,
        resolution_status: 'unresolved',
        needs_human_verification: presence === 'PRESENT_UNVERIFIED',
      });
    }
  }

  // 2. Aspect ratio compliance if configured in authorizedAssets
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

  return {
    presence,
    details,
    findings,
  };
}

export function auditImageLogoAndBrandIdentity(
  imageSummary: ImageSummaryStats | null,
  authorizedAssets: AuthorizedAsset[] = [],
  ocrText?: string,
  options?: LogoAuditOptions
): EngineFinding[] {
  const result = inspectLogoPresenceAndIdentity(imageSummary, authorizedAssets, ocrText, options);
  return result.findings;
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

  // 3. Canvas Edge Proximity / Insufficient Safe Zone Margin
  if (boundingBoxes && boundingBoxes.length > 0) {
    for (const b of boundingBoxes) {
      if (!b.text || b.text.length < 3) continue;
      const isTooCloseToEdge =
        b.bbox.ymin < 15 ||
        b.bbox.xmin < 15 ||
        b.bbox.ymax > 985 ||
        b.bbox.xmax > 985;

      if (isTooCloseToEdge) {
        findings.push({
          category: 'layout_and_design_quality',
          severity: 'low',
          finding_title: `Element Placed Too Close to Canvas Edge: "${b.text}"`,
          explanation: `Typography element "${b.text}" is positioned within 1.5% of the canvas boundary. Elements touching canvas edges risk being cropped or obscured on mobile viewports, app UI headers, or story reels.`,
          evidence_text: b.text,
          confidence: 0.88,
          suggested_fix: `Reflow artboard with a minimum 40px (4%) safe margin inset from all canvas edges.`,
          source: 'ocr_analysis',
          verification_status: 'possible_inconsistency',
          target_type: 'layout',
          target_scope: 'image',
          image_evidence: b.text,
          bounding_box: b.bbox,
          resolution_status: 'unresolved',
          needs_human_verification: true,
          human_verification_reason: 'Check artboard safe margin preview on mobile screens.',
        });
        break; // One edge margin warning is sufficient per creative
      }
    }
  }

  // 4. UI Screenshot Overlays or Interface Artifacts
  if (imageText) {
    const clean = cleanAndNormalizeOcrText(imageText).toLowerCase();
    const uiArtifactMatches = [
      'google lens',
      'tap to view',
      'swipe up',
      'camera roll',
      'screenshot',
      'unread message',
    ].filter((sig) => clean.includes(sig));

    if (uiArtifactMatches.length > 0) {
      findings.push({
        category: 'layout_and_design_quality',
        severity: 'low',
        finding_title: `Screenshot UI Overlay / Interface Artifact Detected: "${uiArtifactMatches[0]}"`,
        explanation: `Creative image contains visible mobile or desktop UI overlay elements ("${uiArtifactMatches.join(', ')}"). Using raw screen captures rather than dedicated vector/raster marketing exports diminishes brand credibility.`,
        evidence_text: uiArtifactMatches.join(', '),
        confidence: 0.92,
        suggested_fix: 'Crop out UI overlays or export clean original graphics from design source files.',
        source: 'ocr_analysis',
        verification_status: 'confirmed_violation',
        target_type: 'visual_element',
        target_scope: 'image',
        resolution_status: 'unresolved',
        needs_human_verification: false,
      });
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
