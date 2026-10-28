/**
 * BrandGuard AI — Comprehensive Logo Governance & False-Positive Elimination Test Suite
 *
 * Validates the 7 required scenarios from Requirement 8:
 * 1. Creative with a clear symbol and brand wordmark (The user's example: Purple "GP" symbol + "Digital Work" in top-left)
 * 2. Creative with a visual logo/emblem having NO readable text
 * 3. Creative with a small logo on a busy/complex background
 * 4. Creative with a logo partially obscured or cropped
 * 5. Creative with NO visible logo (5A: without logo guideline requirement, 5B: with mandated logo guideline)
 * 6. Creative with a logo that differs from a configured reference (detects reference mismatch, NOT missing logo)
 * 7. Creative where NO reference logo is configured (does not invent a missing-logo violation)
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { runVisionAnalysis } from '../src/lib/engine/vision-analyzer';
import { evaluateCompliance } from '../src/lib/engine';
import {
  inspectLogoPresenceAndIdentity,
  evaluateLogoPolicyRequirements,
} from '../src/lib/engine/image-first-analyzer';
import { BrandGuideline, AuthorizedAsset, ApprovedFact } from '../src/lib/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'creatives');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper to generate test images
async function generateTestImages() {
  console.log('Generating diverse test image assets with sharp...');

  // 1. Purple GP Symbol + "Digital Work" wordmark in top-left
  const gpSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#F8FAFC" />
          <stop offset="100%" stop-color="#E2E8F0" />
        </linearGradient>
      </defs>
      <rect width="800" height="800" fill="url(#bg)" />

      <!-- Purple GP Monogram & Digital Work Wordmark (Top-Left) -->
      <g transform="translate(40, 40)">
        <rect width="64" height="64" rx="14" fill="#7C3AED" />
        <text x="32" y="44" font-family="Arial, sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" text-anchor="middle">GP</text>
        <text x="78" y="32" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#1E1B4B">Digital Work</text>
        <text x="78" y="52" font-family="Arial, sans-serif" font-weight="500" font-size="13" fill="#6B7280">Creative Marketing Platform</text>
      </g>

      <!-- Creative Headline & Body -->
      <text x="400" y="380" font-family="Arial, sans-serif" font-weight="800" font-size="36" fill="#0F172A" text-anchor="middle">Automate Visual Compliance</text>
      <text x="400" y="430" font-family="Arial, sans-serif" font-weight="400" font-size="18" fill="#475569" text-anchor="middle">Scale enterprise creative reviews with multimodal vision intelligence.</text>
      <rect x="300" y="480" width="200" height="48" rx="8" fill="#7C3AED" />
      <text x="400" y="510" font-family="Arial, sans-serif" font-weight="700" font-size="16" fill="#FFFFFF" text-anchor="middle">Start Free Trial</text>
    </svg>
  `;
  await sharp(Buffer.from(gpSvg)).png().toFile(path.join(uploadsDir, 'test-gp-digital-work.png'));

  // 2. Pure geometric emblem / symbol with NO readable text
  const symbolSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#0F172A" />

      <!-- Non-textual Golden Diamond Chevron Emblem (Top-Left) -->
      <g transform="translate(50, 50)">
        <polygon points="30,0 60,30 30,60 0,30" fill="#F59E0B" />
        <polygon points="30,12 48,30 30,48 12,30" fill="#0F172A" />
        <circle cx="30" cy="30" r="6" fill="#F59E0B" />
      </g>

      <text x="400" y="400" font-family="Arial, sans-serif" font-weight="800" font-size="34" fill="#F8FAFC" text-anchor="middle">Elite Engineering Architecture</text>
      <text x="400" y="450" font-family="Arial, sans-serif" font-weight="400" font-size="18" fill="#94A3B8" text-anchor="middle">Zero compromise high-availability cloud infrastructure.</text>
    </svg>
  `;
  await sharp(Buffer.from(symbolSvg)).png().toFile(path.join(uploadsDir, 'test-symbol-only-logo.png'));

  // 3. Small logo on a busy colorful background
  const busyBgSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rg1" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#EC4899" />
          <stop offset="50%" stop-color="#8B5CF6" />
          <stop offset="100%" stop-color="#3B82F6" />
        </radialGradient>
      </defs>
      <rect width="800" height="800" fill="url(#rg1)" />
      <circle cx="200" cy="200" r="140" fill="#F43F5E" opacity="0.6" />
      <circle cx="600" cy="300" r="180" fill="#EAB308" opacity="0.5" />
      <circle cx="400" cy="650" r="220" fill="#06B6D4" opacity="0.6" />

      <text x="400" y="380" font-family="Arial, sans-serif" font-weight="900" font-size="44" fill="#FFFFFF" text-anchor="middle">SUMMER FESTIVAL 2026</text>
      <text x="400" y="430" font-family="Arial, sans-serif" font-weight="600" font-size="20" fill="#F1F5F9" text-anchor="middle">Live Music, Art, &amp; Digital Installations</text>

      <!-- Small Compact Logo in Bottom Corner -->
      <g transform="translate(680, 700)">
        <circle cx="30" cy="30" r="26" fill="#FFFFFF" />
        <polygon points="30,14 42,42 18,42" fill="#7C3AED" />
      </g>
    </svg>
  `;
  await sharp(Buffer.from(busyBgSvg)).png().toFile(path.join(uploadsDir, 'test-small-logo-busy-bg.png'));

  // 4. Logo partially cropped / obscured at canvas edge
  const croppedSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#18181B" />

      <!-- Partially cropped brand circle at canvas left border (x = -25) -->
      <g transform="translate(-25, 40)">
        <circle cx="50" cy="50" r="45" fill="#10B981" />
        <text x="50" y="60" font-family="Arial, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" text-anchor="middle">NX</text>
      </g>

      <text x="400" y="400" font-family="Arial, sans-serif" font-weight="800" font-size="34" fill="#FAFAFA" text-anchor="middle">Limited Drop Available</text>
      <text x="400" y="450" font-family="Arial, sans-serif" font-weight="400" font-size="18" fill="#A1A1AA" text-anchor="middle">Precision engineered apparel.</text>
    </svg>
  `;
  await sharp(Buffer.from(croppedSvg)).png().toFile(path.join(uploadsDir, 'test-cropped-logo.png'));

  // 5. Creative with NO visible logo anywhere on canvas
  const noLogoSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#F1F5F9" />
      <text x="400" y="360" font-family="Arial, sans-serif" font-weight="900" font-size="46" fill="#0F172A" text-anchor="middle">FLASH SALE</text>
      <text x="400" y="420" font-family="Arial, sans-serif" font-weight="700" font-size="28" fill="#DC2626" text-anchor="middle">50% OFF EVERYTHING</text>
      <text x="400" y="470" font-family="Arial, sans-serif" font-weight="500" font-size="18" fill="#64748B" text-anchor="middle">Offer valid online through midnight tonight.</text>
      <rect x="320" y="520" width="160" height="46" rx="8" fill="#2563EB" />
      <text x="400" y="550" font-family="Arial, sans-serif" font-weight="700" font-size="16" fill="#FFFFFF" text-anchor="middle">Shop Now</text>
    </svg>
  `;
  await sharp(Buffer.from(noLogoSvg)).png().toFile(path.join(uploadsDir, 'test-no-logo.png'));

  // 6. Creative with a logo that differs from a configured reference (Apex Corp logo)
  const diffLogoSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#030712" />

      <!-- Apex Corp Logo (Differs from configured SoundZen official reference) -->
      <g transform="translate(40, 40)">
        <polygon points="25,5 45,45 5,45" fill="#EA580C" />
        <text x="56" y="35" font-family="Arial, sans-serif" font-weight="900" font-size="22" fill="#F97316">Apex Technologies</text>
      </g>

      <text x="400" y="400" font-family="Arial, sans-serif" font-weight="800" font-size="32" fill="#F9FAFB" text-anchor="middle">Next-Gen Cloud Orchestration</text>
    </svg>
  `;
  await sharp(Buffer.from(diffLogoSvg)).png().toFile(path.join(uploadsDir, 'test-diff-logo.png'));

  // 7. Creative where NO reference logo is configured (Nova Studios brand mark)
  const novaSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#0B1329" />

      <g transform="translate(40, 40)">
        <circle cx="25" cy="25" r="20" fill="#06B6D4" />
        <text x="25" y="32" font-family="Arial, sans-serif" font-weight="900" font-size="20" fill="#FFFFFF" text-anchor="middle">★</text>
        <text x="56" y="33" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#E2E8F0">Nova Studios</text>
      </g>

      <text x="400" y="400" font-family="Arial, sans-serif" font-weight="800" font-size="34" fill="#F8FAFC" text-anchor="middle">Immersive 3D Experience Design</text>
    </svg>
  `;
  await sharp(Buffer.from(novaSvg)).png().toFile(path.join(uploadsDir, 'test-nova-studios.png'));

  console.log('✓ All 7 test images generated successfully.\n');
}

async function runLogoGovernanceTests() {
  console.log('===============================================================');
  console.log('BRANDGUARD AI: LOGO GOVERNANCE & FALSE-POSITIVE PREVENTION SUITE');
  console.log('===============================================================\n');

  await generateTestImages();

  // Test Case 1: The user's exact issue — Purple "GP" symbol and "Digital Work" wordmark
  console.log('--- Test 1: User Example — Purple GP Symbol & "Digital Work" Wordmark ---');
  {
    const gpImagePath = '/uploads/creatives/test-gp-digital-work.png';
    const analysis = await evaluateCompliance({
      imageUrl: gpImagePath,
      contentType: 'ad_copy',
      guidelines: [], // No custom rules requiring a specific whitelist
      facts: [],
      assets: [],
    });

    const missingLogoFinding = analysis.findings.find((f) =>
      f.finding_title.toLowerCase().includes('missing brand logo') ||
      f.finding_title.toLowerCase().includes('no brand logo')
    );

    assert(
      !missingLogoFinding,
      'Does NOT report "Missing Brand Logo" on image visibly containing GP + Digital Work',
      missingLogoFinding ? `Found false violation: ${missingLogoFinding.finding_title} (${missingLogoFinding.confidence * 100}% conf)` : undefined
    );

    const logoPresence = analysis.metadata?.logoPresence;
    assert(
      logoPresence === 'PRESENT' || logoPresence === 'PRESENT_UNVERIFIED',
      `Recognizes logo presence as PRESENT or PRESENT_UNVERIFIED (Got: ${logoPresence})`
    );

    assert(
      analysis.compliance_score !== null && analysis.compliance_score >= 95,
      `Compliance score is not unfairly penalized for missing logo (Score: ${analysis.compliance_score}%)`
    );
  }

  // Test Case 2: Visual logo with NO readable text (Golden geometric emblem)
  console.log('\n--- Test 2: Logo With No Readable Text (Abstract Emblem) ---');
  {
    const symbolPath = '/uploads/creatives/test-symbol-only-logo.png';
    // Provide visual inspection simulation for non-textual emblem
    const inspection = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      [],
      'elite engineering architecture zero compromise high-availability cloud infrastructure',
      {
        hasDetectedLogo: true, // Vision model or icon detector flagged emblem
        logoInspection: {
          presence: 'PRESENT_UNVERIFIED',
          detected_mark: 'Golden diamond chevron geometric emblem in top-left',
          location: 'top-left',
          confidence: 0.88,
        },
      }
    );

    assert(
      inspection.presence === 'PRESENT_UNVERIFIED' || inspection.presence === 'PRESENT',
      `Identifies non-textual emblem as ${inspection.presence} without requiring OCR text match`
    );

    const missingFinding = inspection.findings.find((f) => f.finding_title.toLowerCase().includes('missing'));
    assert(!missingFinding, 'Zero missing-logo findings on pure visual emblem');
  }

  // Test Case 3: Small logo on busy / colorful background
  console.log('\n--- Test 3: Small Logo On Busy Background ---');
  {
    const busyPath = '/uploads/creatives/test-small-logo-busy-bg.png';
    const analysis = await evaluateCompliance({
      imageUrl: busyPath,
      contentType: 'social_media',
      guidelines: [],
      facts: [],
      assets: [],
    });

    const falseCritical = analysis.findings.find(
      (f) => f.finding_title.toLowerCase().includes('missing') && f.confidence >= 0.95
    );
    assert(!falseCritical, 'Never fabricates a 95% confident missing-logo finding on small mark');
  }

  // Test Case 4: Logo partially obscured or cropped
  console.log('\n--- Test 4: Logo Partially Obscured or Cropped ---');
  {
    const croppedInspection = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      [],
      'limited drop available precision engineered apparel',
      {
        logoInspection: {
          presence: 'UNCERTAIN',
          detected_mark: 'Partially cropped green circular NX emblem at left border',
          location: 'left-border',
          confidence: 0.60,
        },
      }
    );

    assert(
      croppedInspection.presence === 'UNCERTAIN',
      `Classified as UNCERTAIN rather than fabricated MISSING (Got: ${croppedInspection.presence})`
    );

    // Without a mandatory guideline, it should NOT produce a confirmed violation
    const confirmedViolation = croppedInspection.findings.find(
      (f) => f.verification_status === 'confirmed_violation' && f.finding_title.toLowerCase().includes('missing')
    );
    assert(!confirmedViolation, 'Does not treat cropped/uncertain logo as confirmed missing logo violation');
  }

  // Test Case 5: Creative with NO visible logo
  console.log('\n--- Test 5: Creative With No Visible Logo ---');
  {
    // 5A: When active brand guidelines DO NOT mandate a logo
    const unmandatedAudit = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      [],
      'flash sale 50% off everything shop now',
      {
        guidelines: [], // No guideline requiring logo
        hasDetectedLogo: false,
      }
    );

    assert(
      unmandatedAudit.presence === 'MISSING',
      'Presence correctly identified as MISSING'
    );
    assert(
      unmandatedAudit.findings.length === 0,
      'Does NOT invent a "Missing Brand Logo" finding when guidelines do not mandate one'
    );

    // 5B: When active brand guidelines DO mandate a logo
    const mandatoryGuideline: BrandGuideline = {
      id: 'g-logo-req',
      title: 'Mandatory Corporate Brand Logo Presence',
      description: 'All commercial marketing creatives must include the official brand logo for attribution.',
      rule_type: 'logo_presence',
      severity: 'medium',
      rule_configuration: { require_logo: true },
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const mandatedAudit = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      [],
      'flash sale 50% off everything shop now',
      {
        guidelines: [mandatoryGuideline],
        hasDetectedLogo: false,
      }
    );

    const missingFinding = mandatedAudit.findings.find((f) =>
      f.finding_title.includes('Missing Brand Logo')
    );
    assert(
      Boolean(missingFinding),
      'Correctly produces "Missing Brand Logo" finding when guidelines explicitly mandate one'
    );
    assert(
      missingFinding?.confidence === 0.88,
      `Calibrates confidence based on visual evidence (Got: ${missingFinding?.confidence}, not arbitrary 0.95)`
    );
    assert(
      Boolean(missingFinding?.evidence_text?.includes('canvas')),
      'Provides concrete canvas visual evidence'
    );
  }

  // Test Case 6: Logo differs from configured reference asset
  console.log('\n--- Test 6: Logo Differs From Configured Reference Asset ---');
  {
    const authorizedAssets: AuthorizedAsset[] = [
      {
        id: 'asset-soundzen-primary',
        asset_name: 'SoundZen Official Logo',
        asset_type: 'logo',
        file_url: '/uploads/assets/soundzen-logo.svg',
        asset_metadata: { is_primary: true },
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ];

    const mismatchInspection = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      authorizedAssets,
      'apex technologies next-gen cloud orchestration',
      {
        logoInspection: {
          presence: 'PRESENT',
          detected_mark: 'Apex Technologies orange triangle logo',
          location: 'top-left',
          confidence: 0.90,
          matches_reference: false,
          reference_notes: 'Detected Apex Technologies mark conflicts with SoundZen Official Logo.',
        },
      }
    );

    const mismatchFinding = mismatchInspection.findings.find((f) =>
      f.finding_title.includes('Reference Mismatch')
    );
    const missingFinding = mismatchInspection.findings.find((f) =>
      f.finding_title.toLowerCase().includes('missing brand logo')
    );

    assert(
      Boolean(mismatchFinding),
      'Generates "Brand Logo Reference Mismatch" finding for conflicting mark'
    );
    assert(
      !missingFinding,
      'Does NOT generate a "Missing Brand Logo" finding when a mark is present but mismatched'
    );
  }

  // Test Case 7: Creative where NO reference logo is configured in guidelines
  console.log('\n--- Test 7: Creative Where No Reference Logo Is Configured ---');
  {
    const noRefInspection = inspectLogoPresenceAndIdentity(
      { width: 800, height: 800, aspectRatio: '1:1', format: 'PNG' },
      [], // Zero authorized assets configured
      'nova studios immersive 3d experience design',
      {
        guidelines: [], // No guidelines
        logoInspection: {
          presence: 'PRESENT_UNVERIFIED',
          detected_mark: 'Nova Studios cyan starburst mark',
          location: 'top-left',
          confidence: 0.85,
        },
      }
    );

    assert(
      noRefInspection.presence === 'PRESENT_UNVERIFIED',
      'Presence is PRESENT_UNVERIFIED without pretending identity was verified'
    );

    const missingLogo = noRefInspection.findings.find((f) => f.finding_title.toLowerCase().includes('missing'));
    const missingRef = noRefInspection.findings.find((f) => f.finding_title.toLowerCase().includes('not configured'));

    assert(!missingLogo, 'Does NOT invent a missing-logo finding when no reference is configured');
    assert(!missingRef, 'Does NOT invent an unconfigured-reference violation without a guideline rule');
  }

  // Test Case 8: End-to-End Contradiction Resolution Verification
  console.log('\n--- Test 8: End-to-End Pipeline Contradiction Resolution ---');
  {
    // Simulate what happened to the user: Model sees GP + Digital Work, but an external rule might suggest missing logo
    const analysis = await evaluateCompliance({
      imageUrl: '/uploads/creatives/test-gp-digital-work.png',
      contentType: 'ad_copy',
      guidelines: [
        {
          id: 'g-general',
          title: 'Clean Design Quality',
          description: 'Ensure marketing creative adheres to high visual standards.',
          rule_type: 'design_quality',
          severity: 'low',
          rule_configuration: {},
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
      facts: [],
      assets: [],
    });

    const missingFindings = analysis.findings.filter((f) =>
      f.finding_title.toLowerCase().includes('missing brand logo') ||
      f.finding_title.toLowerCase().includes('no brand logo')
    );

    assert(
      missingFindings.length === 0,
      'Contradiction resolver completely suppresses false missing-logo findings on visible creative'
    );

    assert(
      analysis.metadata?.checksCompleted?.logoAndBrandIdentity === true,
      'Checks completed records logoAndBrandIdentity as true'
    );
  }

  console.log('\n===============================================================');
  console.log(`LOGO GOVERNANCE RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}% SUCCESS)`);
  console.log('===============================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runLogoGovernanceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
