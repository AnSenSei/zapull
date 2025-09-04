import { test, expect } from '@playwright/test';

// Helper: open filter panel and type to reproduce potential lag
async function openFilterAndType(page) {
  // Open PacksFilterPanel
  await page.getByRole('button', { name: /filters/i }).click();
  // Type in search field
  const input = page.getByPlaceholder('Search by pack name...');
  await expect(input).toBeVisible();
  // Record timing for typing burst
  const start = Date.now();
  await input.type('pikachu pack test', { delay: 25 }); // simulate user typing
  const elapsed = Date.now() - start;
  console.log(`Typing elapsed ms: ${elapsed}`);
}

// Capture baseline HAR and video on desktop
test('baseline desktop: open panel, type, and scroll', async ({ page, context }) => {
  await context.routeFromHAR('artifacts/desktop.har', { update: true, url: /.*/ });
  await page.goto('/');

  // Wait for main content and navbar to settle
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=Packs', { timeout: 15000 });

  await openFilterAndType(page);

  // Scroll to trigger lazy loading and any intersection observers
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(1000);

  // Save a screenshot for quick visual reference
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
});

// Capture baseline HAR and video on mobile emulation
test('baseline mobile: open panel, type, and scroll', async ({ page, context }) => {
  await context.routeFromHAR('artifacts/mobile.har', { update: true, url: /.*/ });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openFilterAndType(page);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
});
