import { test, expect } from '@playwright/test';

test.describe('Content Pipeline Frontend E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/pipeline');
  });

  test('should render Content Pipeline dashboard with header and stats cards', async ({ page }) => {
    // Verify Dashboard Header
    await expect(page.locator('h1')).toContainText('CONTENT PIPELINE');
    await expect(page.locator('text=Transform your learning materials into AI-ready knowledge.')).toBeVisible();

    // Verify 7 Metric Stat Cards
    await expect(page.locator('text=Total Sources')).toBeVisible();
    await expect(page.locator('text=Processing')).toBeVisible();
    await expect(page.locator('text=Ready')).toBeVisible();
    await expect(page.locator('text=Failed')).toBeVisible();
    await expect(page.locator('text=Total Chunks')).toBeVisible();
    await expect(page.locator('text=Indexed Vectors')).toBeVisible();
    await expect(page.locator('text=Knowledge Graph Nodes')).toBeVisible();
  });

  test('should open and close the Create Collection modal', async ({ page }) => {
    await page.click('button:has-text("Create Collection")');
    await expect(page.locator('text="New Knowledge Collection"')).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('text="New Knowledge Collection"')).not.toBeVisible();
  });

  test('should open and close the Upload Content modal', async ({ page }) => {
    await page.click('button:has-text("Upload Content")');
    await expect(page.locator('text="Upload Learning Material"')).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('text="Upload Learning Material"')).not.toBeVisible();
  });

  test('should switch between Content Library and Collections tabs', async ({ page }) => {
    await page.click('button:has-text("Collections")');
    await expect(page.locator('text="Knowledge Collections"')).toBeVisible();

    await page.click('button:has-text("Content Library")');
    await expect(page.locator('input[placeholder*="Search content"]')).toBeVisible();
  });
});
