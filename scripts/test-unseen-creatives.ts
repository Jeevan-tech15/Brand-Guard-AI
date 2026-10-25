import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { runComplianceReview } from '../src/lib/engine';
import { getBrandGuidelines, getApprovedFacts, getAuthorizedAssets, createContentReview, getContentReviewById } from '../src/lib/db';

async function main() {
  console.log('================================================================');
  console.log('BRANDGUARD AI: AUDIT OF GENUINELY UNSEEN CREATIVES');
  console.log('================================================================\n');

  const creativesDir = path.join(process.cwd(), 'public', 'uploads', 'creatives');
  if (!fs.existsSync(creativesDir)) {
    fs.mkdirSync(creativesDir, { recursive: true });
  }

  // -------------------------------------------------------------------
  // 1. Generate Genuinely Unseen SVG and PNG Creatives
  // -------------------------------------------------------------------

  // Creative 1: Clean Travel & Luxury Hospitality (WanderLuxe Escapes)
  const wanderluxeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bg-wl" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg-wl)"/>
  <rect x="60" y="60" width="960" height="960" rx="24" fill="none" stroke="#334155" stroke-width="2"/>
  <text x="540" y="220" font-family="system-ui, sans-serif" font-size="44" font-weight="800" fill="#f8fafc" text-anchor="middle" letter-spacing="3">WANDERLUXE ESCAPES</text>
  <text x="540" y="280" font-family="system-ui, sans-serif" font-size="22" font-weight="500" fill="#94a3b8" text-anchor="middle">CURATED LUXURY EXPEDITIONS</text>
  <rect x="140" y="360" width="800" height="380" rx="16" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="540" y="440" font-family="system-ui, sans-serif" font-size="28" font-weight="600" fill="#e2e8f0" text-anchor="middle">Handcrafted boutique journeys across Europe &amp; Asia</text>
  <text x="540" y="520" font-family="system-ui, sans-serif" font-size="26" font-weight="500" fill="#cbd5e1" text-anchor="middle">Complimentary daily breakfast and private concierge</text>
  <text x="540" y="600" font-family="system-ui, sans-serif" font-size="26" font-weight="500" fill="#cbd5e1" text-anchor="middle">Tailored five-star boutique accommodations</text>
  <text x="540" y="670" font-family="system-ui, sans-serif" font-size="22" font-weight="400" fill="#94a3b8" text-anchor="middle">Verified member of International Luxury Hotel Association</text>
  <rect x="340" y="800" width="400" height="70" rx="35" fill="#0f766e"/>
  <text x="540" y="845" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">EXPLORE ITINERARIES</text>
</svg>`;

  // Creative 2: HealthTech Device with Embedded Text Error (VitalPulse Diagnostics)
  const vitalpulseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bg-vp" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg-vp)"/>
  <rect x="60" y="60" width="960" height="960" rx="24" fill="none" stroke="#047857" stroke-width="2"/>
  <text x="540" y="200" font-family="system-ui, sans-serif" font-size="44" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">VITALPULSE HEALTH</text>
  <text x="540" y="260" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#6ee7b7" text-anchor="middle">CLINICAL CARDIAC TELEMETRY</text>
  <rect x="120" y="340" width="840" height="420" rx="16" fill="#065f46" stroke="#10b981" stroke-width="1.5"/>
  <text x="540" y="420" font-family="system-ui, sans-serif" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">Continuous 24/7 ECG Cardiac Monitoring</text>
  <text x="540" y="500" font-family="system-ui, sans-serif" font-size="28" font-weight="800" fill="#fef08a" text-anchor="middle">100% Guaranteed Cure for All Heart Arrhythmias</text>
  <text x="540" y="580" font-family="system-ui, sans-serif" font-size="26" font-weight="600" fill="#a7f3d0" text-anchor="middle">Zero risk cardiovascular protection for everyone</text>
  <text x="540" y="660" font-family="system-ui, sans-serif" font-size="24" font-weight="500" fill="#d1fae5" text-anchor="middle">Medical grade clinical sensor suite</text>
  <rect x="340" y="820" width="400" height="70" rx="35" fill="#047857"/>
  <text x="540" y="865" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">ORDER TEST MONITOR</text>
</svg>`;

  // Creative 3: Automotive EV with Multimodal Contradictions (Hyperion Motors)
  const hyperionSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bg-hy" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#171717"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg-hy)"/>
  <rect x="60" y="60" width="960" height="960" rx="24" fill="none" stroke="#262626" stroke-width="2"/>
  <text x="540" y="190" font-family="system-ui, sans-serif" font-size="46" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="3">HYPERION MOTORS</text>
  <text x="540" y="250" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#38bdf8" text-anchor="middle">HORIZON GT ELECTRIC SEDAN</text>
  <rect x="120" y="320" width="840" height="440" rx="16" fill="#171717" stroke="#404040" stroke-width="1.5"/>
  <text x="540" y="400" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">520 miles range on a single charge</text>
  <text x="540" y="480" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#38bdf8" text-anchor="middle">FLAT $8,000 Federal &amp; Dealer Rebate</text>
  <text x="540" y="560" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#facc15" text-anchor="middle">8-year battery warranty</text>
  <text x="540" y="640" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#4ade80" text-anchor="middle">Fast 15-minute DC charging</text>
  <text x="540" y="710" font-family="system-ui, sans-serif" font-size="22" font-weight="400" fill="#a3a3a3" text-anchor="middle">EPA estimated range. Subject to dealer terms.</text>
  <rect x="340" y="820" width="400" height="70" rx="35" fill="#0284c7"/>
  <text x="540" y="865" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">RESERVE HORIZON GT</text>
</svg>`;

  const wlSvgPath = path.join(creativesDir, 'unseen-clean-wanderluxe.svg');
  const wlPngPath = path.join(creativesDir, 'unseen-clean-wanderluxe.png');
  const vpSvgPath = path.join(creativesDir, 'unseen-error-vitalpulse.svg');
  const vpPngPath = path.join(creativesDir, 'unseen-error-vitalpulse.png');
  const hySvgPath = path.join(creativesDir, 'unseen-contradiction-hyperion.svg');
  const hyPngPath = path.join(creativesDir, 'unseen-contradiction-hyperion.png');

  fs.writeFileSync(wlSvgPath, wanderluxeSvg, 'utf8');
  fs.writeFileSync(vpSvgPath, vitalpulseSvg, 'utf8');
  fs.writeFileSync(hySvgPath, hyperionSvg, 'utf8');

  await Promise.all([
    sharp(wlSvgPath).png().toFile(wlPngPath),
    sharp(vpSvgPath).png().toFile(vpPngPath),
    sharp(hySvgPath).png().toFile(hyPngPath),
  ]);

  console.log('Generated fresh unseen creatives (SVG + Sharp Rasterized PNG):');
  console.log('  1. Clean: WanderLuxe Escapes (' + wlPngPath + ')');
  console.log('  2. Embedded Error: VitalPulse (' + vpPngPath + ')');
  console.log('  3. Multimodal Contradictions: Hyperion Motors (' + hyPngPath + ')\n');

  // Load Active Brand Governance Rules from Database
  const [guidelines, facts, assets] = await Promise.all([
    getBrandGuidelines(true),
    getApprovedFacts(true),
    getAuthorizedAssets(true),
  ]);

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  function recordResult(condition: boolean, type: 'TP' | 'TN', desc: string) {
    if (type === 'TP') {
      if (condition) {
        tp++;
        console.log(`  ✓ [TP: True Positive] ${desc}`);
      } else {
        fn++;
        console.error(`  ✗ [FN: False Negative / Miss] ${desc}`);
      }
    } else {
      if (condition) {
        tn++;
        console.log(`  ✓ [TN: True Negative] ${desc}`);
      } else {
        fp++;
        console.error(`  ✗ [FP: False Positive / Spurious Alarm] ${desc}`);
      }
    }
  }

  // -------------------------------------------------------------------
  // TEST 1: Genuinely Unseen Clean Creative (WanderLuxe Escapes)
  // -------------------------------------------------------------------
  console.log('--- Test 1: Clean Creative — WanderLuxe Escapes (Travel & Hospitality) ---');
  const wlCaption = 'Discover handcrafted boutique journeys across Europe and Asia with WanderLuxe Escapes. Every booking includes complimentary daily breakfast and private concierge services.';
  
  const wlReview = await runComplianceReview(
    wlCaption,
    'social_media',
    guidelines,
    facts,
    {
      imageUrl: '/uploads/creatives/unseen-clean-wanderluxe.png',
      captionText: wlCaption,
      assets,
    }
  );

  console.log(`  Observed OCR Text: "${wlReview.extracted_ocr_text?.slice(0, 80).replace(/\n/g, ' ')}..."`);
  console.log(`  Compliance Score: ${wlReview.compliance_score}%, Status: ${wlReview.status}, Findings: ${wlReview.findings.length}`);
  
  recordResult(wlReview.findings.length === 0, 'TN', 'Zero false violation findings on clean compliant creative');
  recordResult(wlReview.compliance_score === 100, 'TN', 'Receives 100% compliance score without arbitrary penalties');
  recordResult(wlReview.status === 'approved', 'TN', 'Assigned APPROVED governance gate');
  console.log();

  // -------------------------------------------------------------------
  // TEST 2: Genuinely Unseen Creative With Embedded Text Error (VitalPulse Health)
  // -------------------------------------------------------------------
  console.log('--- Test 2: Creative With Embedded Text Error — VitalPulse Health (Healthcare Devices) ---');
  const vpCaption = 'VitalPulse is an FDA-cleared Class II medical device offering 24/7 continuous cardiac telemetry at home.';
  
  const vpReview = await runComplianceReview(
    vpCaption,
    'social_media',
    guidelines,
    facts,
    {
      imageUrl: '/uploads/creatives/unseen-error-vitalpulse.png',
      captionText: vpCaption,
      assets,
    }
  );

  console.log(`  Observed OCR Text: "${vpReview.extracted_ocr_text?.slice(0, 100).replace(/\n/g, ' ')}..."`);
  console.log(`  Compliance Score: ${vpReview.compliance_score}%, Status: ${vpReview.status}, Findings: ${vpReview.findings.length}`);
  vpReview.findings.forEach((f) => {
    console.log(`   - Finding: "${f.finding_title}" [Severity: ${f.severity}] Evidence: "${f.evidence_text}"`);
  });

  const hasProhibitedClaim = vpReview.findings.some(
    (f) =>
      f.finding_title.toLowerCase().includes('guarantee') ||
      f.finding_title.toLowerCase().includes('prohibited') ||
      f.explanation.toLowerCase().includes('guarantee') ||
      (f.evidence_text && (f.evidence_text.includes('100% Guaranteed Cure') || f.evidence_text.includes('Zero risk')))
  );

  recordResult(hasProhibitedClaim, 'TP', 'Flags prohibited absolute guarantee claim ("100% Guaranteed Cure")');
  recordResult(vpReview.findings.length >= 1, 'TP', 'Detects embedded text policy violations');
  recordResult(vpReview.compliance_score! <= 75, 'TP', `Compliance score penalized for prohibited clinical claim (${vpReview.compliance_score}%)`);
  recordResult(vpReview.status === 'flagged', 'TP', 'Assigned FLAGGED governance gate due to critical policy violation');
  console.log();

  // -------------------------------------------------------------------
  // TEST 3: Genuinely Unseen Creative With Multimodal Contradictions (Hyperion Motors)
  // -------------------------------------------------------------------
  console.log('--- Test 3: Multimodal Contradictions — Hyperion Motors (Automotive & Clean Transport) ---');
  const hyCaption = 'Introducing the all-electric Hyperion Horizon EV Sedan! Enjoy 350 miles range with our exclusive $5,000 dealer rebate and a 3-year battery warranty. Supercharge in 45 minutes!';
  
  const hyReview = await runComplianceReview(
    hyCaption,
    'social_media',
    guidelines,
    facts,
    {
      imageUrl: '/uploads/creatives/unseen-contradiction-hyperion.png',
      captionText: hyCaption,
      assets,
    }
  );

  console.log(`  Observed OCR Text: "${hyReview.extracted_ocr_text?.slice(0, 120).replace(/\n/g, ' ')}..."`);
  console.log(`  Compliance Score: ${hyReview.compliance_score}%, Status: ${hyReview.status}, Findings: ${hyReview.findings.length}`);
  hyReview.findings.forEach((f) => {
    console.log(`   - Finding: "${f.finding_title}" [${f.severity}] Evidence: "${f.evidence_text}"`);
  });

  const hasPriceContradiction = hyReview.findings.some(
    (f) => f.finding_title.toLowerCase().includes('price') || (f.evidence_text && f.evidence_text.includes('8,000') && f.evidence_text.includes('5,000'))
  );
  const hasWarrantyContradiction = hyReview.findings.some(
    (f) => f.finding_title.toLowerCase().includes('warranty') || (f.evidence_text && f.evidence_text.includes('8-year') && f.evidence_text.includes('3-year'))
  );
  const hasDurationContradiction = hyReview.findings.some(
    (f) => f.finding_title.toLowerCase().includes('duration') || (f.evidence_text && f.evidence_text.includes('15') && f.evidence_text.includes('45'))
  );

  recordResult(hasPriceContradiction, 'TP', 'Detects vehicle rebate / price contradiction ($8,000 in image vs $5,000 in caption)');
  recordResult(hasWarrantyContradiction, 'TP', 'Detects battery warranty contradiction (8-year in image vs 3-year in caption)');
  recordResult(hasDurationContradiction, 'TP', 'Detects charging duration contradiction (15-minute in image vs 45 minutes in caption)');
  recordResult(hyReview.status === 'flagged', 'TP', 'Assigned FLAGGED governance gate');
  recordResult(hyReview.compliance_score! <= 50, 'TP', `Score heavily penalized for multiple critical contradictions (${hyReview.compliance_score}%)`);
  console.log();

  // -------------------------------------------------------------------
  // TEST 4: Full End-to-End Database & Persistence Lifecycle
  // -------------------------------------------------------------------
  console.log('--- Test 4: Dynamic End-to-End Database Persistence Audit ---');
  const persisted = await createContentReview({
    title: 'Hyperion Horizon GT Electric Launch Multimodal Review',
    content_text: hyCaption,
    caption_text: hyCaption,
    content_type: 'social_media',
    image_url: '/uploads/creatives/unseen-contradiction-hyperion.png',
  });

  recordResult(Boolean(persisted.id), 'TP', `Created real review record with UUID (${persisted.id})`);
  recordResult(persisted.status === 'flagged', 'TP', `Persisted status reflects FLAGGED governance gate (${persisted.status})`);
  recordResult(persisted.compliance_score! <= 50, 'TP', `Persisted compliance score accurately stored (${persisted.compliance_score}%)`);

  const fetched = await getContentReviewById(persisted.id);
  recordResult(Boolean(fetched && (fetched.findings?.length || 0) >= 3), 'TP', `Retrieved review retains all findings (Found: ${fetched?.findings?.length})`);
  console.log();

  // -------------------------------------------------------------------
  // Summary Metrics
  // -------------------------------------------------------------------
  const total = tp + tn + fp + fn;
  const accuracy = Math.round(((tp + tn) / total) * 100);
  const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 100) : 100;
  const recall = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 100) : 100;

  console.log('================================================================');
  console.log('UNSEEN CREATIVES BENCHMARK AUDIT RESULTS');
  console.log('================================================================');
  console.log(`  True Positives (Correctly Flagged Violations):     ${tp}`);
  console.log(`  True Negatives (Correctly Passed Clean Claims):     ${tn}`);
  console.log(`  False Positives (Spurious Alarms / Noise):         ${fp}`);
  console.log(`  False Negatives (Missed Real Violations):          ${fn}`);
  console.log(`  Accuracy:                                          ${accuracy}%`);
  console.log(`  Precision:                                         ${precision}%`);
  console.log(`  Recall:                                            ${recall}%`);
  console.log('================================================================\n');

  if (fp > 0 || fn > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit failed with uncaught exception:', err);
  process.exit(1);
});
