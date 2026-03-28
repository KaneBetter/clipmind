/**
 * Playwright screen recording for ClipMind product video.
 *
 * Records browser interactions (scrolling, clicking, hovering) as WebM videos
 * for each key page. These recordings replace static screenshots in the
 * Remotion video composition.
 *
 * Run via: tsx scripts/record-screens.ts
 *
 * Environment variables:
 *   CLIPMIND_PROJECT_ID  — project to record (default: 1)
 *   CLIPMIND_BASE_URL    — app origin (default: http://localhost:3000)
 */

import { chromium, type Page, type BrowserContext } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.resolve(__dirname, '..', 'public', 'recordings');

const PROJECT_ID = process.env.CLIPMIND_PROJECT_ID ?? '1';
const BASE_URL = process.env.CLIPMIND_BASE_URL ?? 'http://localhost:3000';

const VIEWPORT = { width: 1920, height: 1080 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Smooth scroll the main content area over `durationMs`. */
async function smoothScroll(page: Page, pixels: number, durationMs = 2000): Promise<void> {
  const steps = 60;
  const stepPx = pixels / steps;
  const stepDelay = durationMs / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((px) => {
      const el = document.querySelector('.flex-1.overflow-y-auto') ?? document.scrollingElement;
      el?.scrollBy(0, px);
    }, stepPx);
    await page.waitForTimeout(stepDelay);
  }
}

/** Wait for page to be fully loaded and settled. */
async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  try {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15_000 });
  } catch {
    // No spinner or already hidden
  }
  await page.waitForTimeout(600);
}

/** Navigate to a project route and wait. */
async function goTo(page: Page, route: string): Promise<void> {
  const url = `${BASE_URL}/projects/${PROJECT_ID}${route}`;
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
}

/**
 * Create a new recording context, execute actions, close context,
 * and move the recorded video to the target path.
 */
async function recordScene(
  name: string,
  actions: (page: Page) => Promise<void>,
): Promise<{ name: string; success: boolean; error?: string }> {
  console.log(`\n[Recording] ${name}`);
  const tmpDir = path.join(RECORDINGS_DIR, '_tmp_' + name);
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'light',
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tmpDir,
      size: VIEWPORT,
    },
  });

  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });

  try {
    await actions(page);

    // Close page and context to finalize the video
    const videoPath = await page.video()?.path();
    await page.close();
    await context.close();
    await browser.close();

    // Move video to final location
    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(RECORDINGS_DIR, `${name}.webm`);
      fs.renameSync(videoPath, dest);
      const sizeKB = Math.round(fs.statSync(dest).size / 1024);
      console.log(`  -> Saved ${name}.webm (${sizeKB} KB)`);
    }

    // Cleanup tmp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { name, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed ${name}: ${msg}`);
    await browser.close().catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { name, success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Scene recording actions
// ---------------------------------------------------------------------------

/** Dashboard: overview → scroll down to see stats */
async function recordDashboard(page: Page): Promise<void> {
  await goTo(page, '');
  await page.waitForTimeout(1500);
  await smoothScroll(page, 500, 2500);
  await page.waitForTimeout(1500);
  await smoothScroll(page, 300, 1500);
  await page.waitForTimeout(1000);
}

/** Map: load map → wait for tiles → slight zoom */
async function recordMap(page: Page): Promise<void> {
  await goTo(page, '/map');
  await page.waitForTimeout(3000); // tiles loading
  // Hover over a cluster marker
  const marker = page.locator('.leaflet-marker-icon').first();
  if (await marker.isVisible({ timeout: 3000 })) {
    await marker.hover();
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);
}

/** Analysis: overview → scroll to charts → scroll to results */
async function recordAnalysis(page: Page): Promise<void> {
  await goTo(page, '/analysis');
  await page.waitForTimeout(1500);
  await smoothScroll(page, 400, 2000);
  await page.waitForTimeout(1500);
  await smoothScroll(page, 400, 2000);
  await page.waitForTimeout(1500);
}

/** Stability: overview → scroll to shake curves */
async function recordStability(page: Page): Promise<void> {
  await goTo(page, '/stability');
  await page.waitForTimeout(1500);
  await smoothScroll(page, 500, 2500);
  await page.waitForTimeout(2000);
}

/** Videos: grid → open filters → browse */
async function recordVideos(page: Page): Promise<void> {
  await goTo(page, '/videos');
  await page.waitForTimeout(1500);

  // Open filter panel
  const filterToggle = page.locator('button', { hasText: /Filters|筛选/ }).first();
  if (await filterToggle.isVisible({ timeout: 3000 })) {
    await filterToggle.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // Click a scene filter
  const sceneButton = page.locator('.w-72 button').filter({ hasText: /.+/ }).nth(3);
  if (await sceneButton.isVisible({ timeout: 2000 })) {
    await sceneButton.click();
    await page.waitForTimeout(1500);
  }

  await smoothScroll(page, 300, 1500);
  await page.waitForTimeout(1000);
}

/** Timeline: list → select timeline → scroll detail */
async function recordTimeline(page: Page): Promise<void> {
  await goTo(page, '/timeline');
  await page.waitForTimeout(2000);

  // Click first timeline item
  const firstItem = page.locator('[class*="cursor-pointer"]').first();
  if (await firstItem.isVisible({ timeout: 3000 })) {
    await firstItem.click({ force: true });
    await page.waitForTimeout(1500);
  }

  await smoothScroll(page, 400, 2000);
  await page.waitForTimeout(1500);
}

/** Music: list → scroll → show analysis */
async function recordMusic(page: Page): Promise<void> {
  await goTo(page, '/music');
  // Ensure light mode is applied
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  });
  await page.waitForTimeout(2000);
  await smoothScroll(page, 300, 1500);
  await page.waitForTimeout(1500);

  // Click analyze button if visible
  const analyzeBtn = page.locator('button.bg-amber-500').first();
  if (await analyzeBtn.isVisible({ timeout: 2000 })) {
    await analyzeBtn.click();
    await waitForReady(page);
    await page.waitForTimeout(1500);
  }

  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RecordingSpec {
  name: string;
  actions: (page: Page) => Promise<void>;
}

const RECORDINGS: RecordingSpec[] = [
  { name: 'dashboard', actions: recordDashboard },
  { name: 'map', actions: recordMap },
  { name: 'analysis', actions: recordAnalysis },
  { name: 'stability', actions: recordStability },
  { name: 'videos', actions: recordVideos },
  { name: 'timeline', actions: recordTimeline },
  { name: 'music', actions: recordMusic },
];

export async function recordAllScreens(): Promise<
  Array<{ name: string; success: boolean; error?: string }>
> {
  console.log('=== ClipMind Screen Recording ===');
  console.log(`  Base URL:   ${BASE_URL}`);
  console.log(`  Project ID: ${PROJECT_ID}`);
  console.log(`  Output:     ${RECORDINGS_DIR}`);

  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const spec of RECORDINGS) {
    const result = await recordScene(spec.name, spec.actions);
    results.push(result);
  }

  // Summary
  console.log('\n=== Summary ===');
  const ok = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`  Total: ${results.length}  |  OK: ${ok}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.log('  Failed:');
    for (const r of results.filter((r) => !r.success)) {
      console.log(`    - ${r.name}: ${r.error}`);
    }
  }

  // List output files
  console.log('\n  Output files:');
  for (const r of results.filter((r) => r.success)) {
    const fp = path.join(RECORDINGS_DIR, `${r.name}.webm`);
    if (fs.existsSync(fp)) {
      const sizeKB = Math.round(fs.statSync(fp).size / 1024);
      console.log(`    ${r.name}.webm — ${sizeKB} KB`);
    }
  }

  return results;
}

// Health check then record
async function main(): Promise<void> {
  console.log(`Checking if ${BASE_URL} is reachable...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok && response.status !== 304) {
      console.log(`  Server responded with HTTP ${response.status}`);
    } else {
      console.log(`  Server is up (HTTP ${response.status})`);
    }
  } catch {
    console.error('Cannot reach the ClipMind app. Start it first.');
    process.exit(1);
  }

  await recordAllScreens();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
