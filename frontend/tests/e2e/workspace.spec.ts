import { test, expect } from '@playwright/test';

test.describe('Notebook Workspace E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and bypass Firebase UI for testing via a mock endpoint or state injection
    await page.goto('http://localhost:5173');
    // Assuming local dev bypasses auth or we set local storage
  });

  test('should create a notebook and navigate to it', async ({ page }) => {
    await page.click('text="New Notebook"');
    await page.fill('input[placeholder="Notebook Title"]', 'Playwright Test Notebook');
    await page.click('button:has-text("Create")');
    
    // Verify it appears in the sidebar
    await expect(page.locator('text="Playwright Test Notebook"')).toBeVisible();
  });

  test('should allow asking a question in Teacher Mode', async ({ page }) => {
    // In a real E2E, we'd ensure the notebook is selected first
    const chatInput = page.locator('textarea[placeholder*="Ask anything"]');
    await chatInput.fill('What is the capital of France?');
    
    await page.click('button:has-text("Send")'); // Or whatever the submit button is mapped to
    
    // Wait for the SSE stream to yield a response bubble
    const aiResponse = page.locator('.prose'); // Assuming the response has a prose class
    await expect(aiResponse).toBeVisible({ timeout: 10000 });
  });
});
