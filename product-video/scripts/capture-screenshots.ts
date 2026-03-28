/**
 * Playwright screenshot capture for ClipMind product video.
 *
 * Captures viewport-sized (1920x1080) dark-mode screenshots of every key page
 * in the ClipMind web app. Designed to run via `tsx scripts/capture-screenshots.ts`.
 *
 * Environment variables:
 *   CLIPMIND_PROJECT_ID  — project to screenshot (default: 1)
 *   CLIPMIND_BASE_URL    — app origin (default: http://localhost:3000)
 */

import { chromium, type Page } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'public', 'screenshots');

const PROJECT_ID = process.env.CLIPMIND_PROJECT_ID ?? '1';
const BASE_URL = process.env.CLIPMIND_BASE_URL ?? 'http://localhost:3000';

const VIEWPORT = { width: 1920, height: 1080 };
const SETTLE_MS = 800;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for network idle, then wait for all spinners to disappear, then settle. */
async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');

  // Wait up to 15 s for all animate-spin spinners to disappear
  try {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15_000 });
  } catch {
    // No spinner found or already hidden — continue
  }

  await page.waitForTimeout(SETTLE_MS);
}

/** Navigate to a route under the current project and wait for content. */
async function goTo(page: Page, route: string): Promise<void> {
  const url = `${BASE_URL}/projects/${PROJECT_ID}${route}`;
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
}

/** Take a viewport-only screenshot and save to the screenshots dir. */
async function snap(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  -> Saved ${name}`);
}

// ---------------------------------------------------------------------------
// Individual capture routines
// ---------------------------------------------------------------------------

interface CaptureResult {
  name: string;
  success: boolean;
  error?: string;
}

async function captureDashboard(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Dashboard overview
  try {
    console.log('[1/14] Dashboard');
    await goTo(page, '');
    await snap(page, 'dashboard.png');
    results.push({ name: 'dashboard.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed dashboard.png: ${msg}`);
    results.push({ name: 'dashboard.png', success: false, error: msg });
  }

  // Dashboard with settings modal open
  try {
    console.log('[2/14] Dashboard — Settings modal');
    // Click the gear icon button (has title="Project Settings")
    const settingsBtn = page.locator('button[title="Project Settings"]');
    await settingsBtn.click();
    await page.waitForTimeout(500); // modal animation
    await snap(page, 'dashboard-settings.png');
    results.push({ name: 'dashboard-settings.png', success: true });

    // Close modal to leave clean state (press Escape)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed dashboard-settings.png: ${msg}`);
    results.push({ name: 'dashboard-settings.png', success: false, error: msg });
  }

  return results;
}

async function captureMediaGrid(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Media grid
  try {
    console.log('[3/14] Media grid');
    await goTo(page, '/videos');
    await snap(page, 'media-grid.png');
    results.push({ name: 'media-grid.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed media-grid.png: ${msg}`);
    results.push({ name: 'media-grid.png', success: false, error: msg });
  }

  // Media grid with active filters
  try {
    console.log('[4/14] Media grid — Filters');
    // Open the filter panel by clicking the Filters toggle button
    const filterToggle = page.locator('button', { hasText: /Filters|筛选/ }).first();
    await filterToggle.click({ force: true });
    await page.waitForTimeout(400);

    // Click a scene category button to activate a filter
    // Scene categories are rendered as buttons inside the FilterPanel
    const sceneButton = page.locator('.w-72 button').filter({ hasText: /.+/ }).nth(3);
    if (await sceneButton.isVisible()) {
      await sceneButton.click();
      await waitForReady(page);
    }

    await snap(page, 'media-filters.png');
    results.push({ name: 'media-filters.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed media-filters.png: ${msg}`);
    results.push({ name: 'media-filters.png', success: false, error: msg });
  }

  return results;
}

async function captureAnalysis(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Analysis overview
  try {
    console.log('[5/14] Analysis overview');
    await goTo(page, '/analysis');
    await snap(page, 'analysis-overview.png');
    results.push({ name: 'analysis-overview.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed analysis-overview.png: ${msg}`);
    results.push({ name: 'analysis-overview.png', success: false, error: msg });
  }

  // Analysis results (scrolled down)
  try {
    console.log('[6/14] Analysis results');
    await page.evaluate(() => {
      const el = document.querySelector('.flex-1.overflow-y-auto') ?? document.scrollingElement;
      el?.scrollTo(0, 600);
    });
    await page.waitForTimeout(SETTLE_MS);
    await snap(page, 'analysis-results.png');
    results.push({ name: 'analysis-results.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed analysis-results.png: ${msg}`);
    results.push({ name: 'analysis-results.png', success: false, error: msg });
  }

  return results;
}

async function captureStability(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Stability overview
  try {
    console.log('[7/14] Stability overview');
    await goTo(page, '/stability');
    await snap(page, 'stability-overview.png');
    results.push({ name: 'stability-overview.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed stability-overview.png: ${msg}`);
    results.push({ name: 'stability-overview.png', success: false, error: msg });
  }

  // Stability chart (scrolled down)
  try {
    console.log('[8/14] Stability chart');
    await page.evaluate(() => {
      const el = document.querySelector('.flex-1.overflow-y-auto') ?? document.scrollingElement;
      el?.scrollTo(0, 600);
    });
    await page.waitForTimeout(SETTLE_MS);
    await snap(page, 'stability-chart.png');
    results.push({ name: 'stability-chart.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed stability-chart.png: ${msg}`);
    results.push({ name: 'stability-chart.png', success: false, error: msg });
  }

  return results;
}

async function captureMap(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  try {
    console.log('[9/14] Map markers');
    await goTo(page, '/map');
    // Maps may need extra time for tile loading
    await page.waitForTimeout(2000);
    await snap(page, 'map-markers.png');
    results.push({ name: 'map-markers.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed map-markers.png: ${msg}`);
    results.push({ name: 'map-markers.png', success: false, error: msg });
  }

  return results;
}

async function captureCopywrite(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  try {
    console.log('[10/14] Copywrite styles');
    await goTo(page, '/copywrite');
    await snap(page, 'copywrite-styles.png');
    results.push({ name: 'copywrite-styles.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed copywrite-styles.png: ${msg}`);
    results.push({ name: 'copywrite-styles.png', success: false, error: msg });
  }

  return results;
}

async function captureMusic(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Music list
  try {
    console.log('[11/14] Music list');
    await goTo(page, '/music');
    await snap(page, 'music-list.png');
    results.push({ name: 'music-list.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed music-list.png: ${msg}`);
    results.push({ name: 'music-list.png', success: false, error: msg });
  }

  // Music analysis — click the first track's analyze button (amber Zap button)
  try {
    console.log('[12/14] Music analysis');
    const analyzeBtn = page
      .locator('button.bg-amber-500')
      .first();

    if (await analyzeBtn.isVisible({ timeout: 3000 })) {
      await analyzeBtn.click();
      // Wait for analysis to complete (spinner disappears)
      await waitForReady(page);
      // Extra wait for beat visualization to render
      await page.waitForTimeout(1000);
    }

    await snap(page, 'music-analysis.png');
    results.push({ name: 'music-analysis.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed music-analysis.png: ${msg}`);
    results.push({ name: 'music-analysis.png', success: false, error: msg });
  }

  return results;
}

async function captureTimeline(page: Page): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  // Timeline overview
  try {
    console.log('[13/14] Timeline overview');
    await goTo(page, '/timeline');
    await snap(page, 'timeline-overview.png');
    results.push({ name: 'timeline-overview.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed timeline-overview.png: ${msg}`);
    results.push({ name: 'timeline-overview.png', success: false, error: msg });
  }

  // Timeline detail — first timeline tab is auto-selected; wait for detail view
  try {
    console.log('[14/14] Timeline detail');
    // The first timeline tab auto-selects; wait for detail content to render
    try {
      await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 });
    } catch {
      // no spinner
    }
    await page.waitForTimeout(SETTLE_MS);

    // Click on the first timeline item to show detail
    const firstTimeline = page.locator('button, [role="tab"], a').filter({ hasText: /.+/ }).first();
    try {
      await firstTimeline.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(SETTLE_MS);
    } catch { /* no clickable timeline item */ }
    // Scroll content area
    await page.evaluate(() => {
      const el = document.querySelector('.flex-1.overflow-y-auto') ?? document.scrollingElement;
      el?.scrollTo(0, 300);
    });
    await page.waitForTimeout(SETTLE_MS);

    await snap(page, 'timeline-detail.png');
    results.push({ name: 'timeline-detail.png', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  !! Failed timeline-detail.png: ${msg}`);
    results.push({ name: 'timeline-detail.png', success: false, error: msg });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function captureAllScreenshots(): Promise<CaptureResult[]> {
  console.log('=== ClipMind Screenshot Capture ===');
  console.log(`  Base URL:   ${BASE_URL}`);
  console.log(`  Project ID: ${PROJECT_ID}`);
  console.log(`  Output:     ${SCREENSHOTS_DIR}`);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Force dark mode at the media level as well
  await page.emulateMedia({ colorScheme: 'dark' });

  const allResults: CaptureResult[] = [];

  try {
    allResults.push(...await captureDashboard(page));
    allResults.push(...await captureMediaGrid(page));
    allResults.push(...await captureAnalysis(page));
    allResults.push(...await captureStability(page));
    allResults.push(...await captureMap(page));
    allResults.push(...await captureCopywrite(page));
    allResults.push(...await captureMusic(page));
    allResults.push(...await captureTimeline(page));
  } finally {
    await browser.close();
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  const succeeded = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;
  console.log(`  Total: ${allResults.length}  |  OK: ${succeeded}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.log('');
    console.log('  Failed screenshots:');
    for (const r of allResults.filter((r) => !r.success)) {
      console.log(`    - ${r.name}: ${r.error}`);
    }
  }

  return allResults;
}

// Run if executed directly
captureAllScreenshots().catch((err) => {
  console.error('Fatal error during screenshot capture:', err);
  process.exit(1);
});
