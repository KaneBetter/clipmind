/**
 * Orchestrator for ClipMind screenshot capture.
 *
 * 1. Checks that localhost:3000 (or CLIPMIND_BASE_URL) is reachable
 * 2. Runs capture-screenshots.ts
 * 3. Validates that all expected files were created
 * 4. Reports results
 *
 * Run via: tsx scripts/capture-all.ts
 */

import { captureAllScreenshots } from './capture-screenshots.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'public', 'screenshots');
const BASE_URL = process.env.CLIPMIND_BASE_URL ?? 'http://localhost:3000';

const EXPECTED_FILES = [
  'dashboard.png',
  'dashboard-settings.png',
  'media-grid.png',
  'media-filters.png',
  'analysis-overview.png',
  'analysis-results.png',
  'stability-overview.png',
  'stability-chart.png',
  'map-markers.png',
  'copywrite-styles.png',
  'music-list.png',
  'music-analysis.png',
  'timeline-overview.png',
  'timeline-detail.png',
];

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function checkServer(): Promise<boolean> {
  console.log(`Checking if ${BASE_URL} is reachable...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok || response.status === 304) {
      console.log(`  Server is up (HTTP ${response.status})`);
      return true;
    }
    // Non-OK but reachable — still usable (e.g. redirect)
    console.log(`  Server responded with HTTP ${response.status} — proceeding anyway`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Server is not reachable: ${msg}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  file: string;
  exists: boolean;
  sizeKB: number;
}

function validateScreenshots(): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const file of EXPECTED_FILES) {
    const filePath = path.join(SCREENSHOTS_DIR, file);
    const exists = fs.existsSync(filePath);
    let sizeKB = 0;
    if (exists) {
      const stat = fs.statSync(filePath);
      sizeKB = Math.round(stat.size / 1024);
    }
    results.push({ file, exists, sizeKB });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  ClipMind Screenshot Capture Pipeline  ');
  console.log('========================================');
  console.log('');

  // Step 1: Health check
  const serverUp = await checkServer();
  if (!serverUp) {
    console.error('');
    console.error('Cannot reach the ClipMind app. Please ensure it is running:');
    console.error(`  cd frontend && npm run dev`);
    console.error('  — or —');
    console.error(`  docker compose -f docker-compose.dev.yml up -d`);
    console.error('');
    process.exit(1);
  }
  console.log('');

  // Step 2: Capture screenshots
  console.log('--- Starting screenshot capture ---');
  console.log('');
  const captureResults = await captureAllScreenshots();
  console.log('');

  // Step 3: Validate output files
  console.log('--- Validating output files ---');
  const validationResults = validateScreenshots();

  const maxNameLen = Math.max(...validationResults.map((r) => r.file.length));
  for (const r of validationResults) {
    const status = r.exists ? 'OK' : 'MISSING';
    const size = r.exists ? `${r.sizeKB} KB` : '-';
    console.log(`  ${r.file.padEnd(maxNameLen + 2)} ${status.padEnd(8)} ${size}`);
  }

  // Step 4: Final report
  const totalExpected = EXPECTED_FILES.length;
  const totalPresent = validationResults.filter((r) => r.exists).length;
  const totalMissing = totalExpected - totalPresent;
  const capturedOK = captureResults.filter((r) => r.success).length;
  const capturedFailed = captureResults.filter((r) => !r.success).length;

  console.log('');
  console.log('========================================');
  console.log('  Results');
  console.log('========================================');
  console.log(`  Captured:   ${capturedOK}/${captureResults.length} succeeded`);
  console.log(`  On disk:    ${totalPresent}/${totalExpected} files present`);

  if (capturedFailed > 0) {
    console.log(`  Failed:     ${capturedFailed} capture(s) failed`);
  }
  if (totalMissing > 0) {
    console.log(`  Missing:    ${totalMissing} file(s) not found on disk`);
    for (const r of validationResults.filter((v) => !v.exists)) {
      console.log(`    - ${r.file}`);
    }
  }

  console.log('');

  if (totalMissing === 0 && capturedFailed === 0) {
    console.log('All screenshots captured successfully!');
  } else {
    console.log('Some screenshots are missing or failed. Review the log above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in capture pipeline:', err);
  process.exit(1);
});
