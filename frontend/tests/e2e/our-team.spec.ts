import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * /our-team — "Meet the Founder".
 *
 * The page is public, so every test here runs in a clean context with no auth state: if any
 * of them ever start needing a signed-in user, the route has regressed.
 *
 * Note on protected destinations: some CTAs point at real but gated routes (/community,
 * /coverage, /plan, /chat). Signed out, those legitimately land on /signin. The broken-link
 * test below treats /signin as "route exists, gated" and only fails on the catch-all bounce
 * to "/", which is what a genuinely missing route does in this SPA (App.tsx: path="*").
 */

const ROUTE = '/our-team';

/** Loads the page with a pinned theme. ThemeContext reads these keys on first render. */
async function gotoOurTeam(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => {
    localStorage.setItem('app-theme-preference', t);
    localStorage.setItem('app-theme', t);
  }, theme);
  await page.goto(ROUTE);
  await expect(page.getByRole('heading', { level: 1, name: 'Meet the Founder' })).toBeVisible();
}

type Rgb = [number, number, number];

/**
 * The colour actually rendered at an element, rather than the one it declares.
 *
 * Reading `backgroundColor` on its own proves nothing here. Tailwind v4 emits translucent
 * oklab() — `dark:bg-white/[0.03]` computes to `oklab(0.99… / 0.03)` — so a card that looks
 * near-black on the page reports a value whose numbers read as white. This paints the whole
 * ancestor stack onto a 1×1 canvas the way the compositor does and samples the result, which
 * is both correct for any colour syntax and closer to what a person actually sees.
 */
function renderedBackground(target: Locator): Promise<Rgb> {
  return target.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    // The browser's own page ground, under everything the document paints.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);

    const layers: string[] = [];
    for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
      layers.push(getComputedStyle(n).backgroundColor);
    }
    for (const bg of layers.reverse()) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  });
}

/** An element's text colour, normalised to sRGB through the same canvas path. */
function renderedColor(target: Locator): Promise<Rgb> {
  return target.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  });
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: Rgb) {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text and its rendered ground must clear the AA threshold for their size. */
async function expectReadable(target: Locator, min = 4.5) {
  const [fg, bg] = await Promise.all([renderedColor(target), renderedBackground(target)]);
  expect(
    Number(contrast(fg, bg).toFixed(2)),
    `contrast of rgb(${fg}) on rgb(${bg})`,
  ).toBeGreaterThanOrEqual(min);
}

test.describe('/our-team — page', () => {
  test('renders the route with its heading and positioning copy', async ({ page }) => {
    await gotoOurTeam(page);

    await expect(page).toHaveURL(/\/our-team$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meet the Founder');
    await expect(page.getByText('Building Sadhya from the ground up.')).toBeVisible();
    await expect(
      page.getByText(/exam preparation should understand not only what students study/i),
    ).toBeVisible();
  });

  test('is publicly accessible — no auth, no redirect, survives a reload', async ({ page }) => {
    await gotoOurTeam(page);
    // ProtectedRoute would have sent an unauthenticated visit to /signin.
    await expect(page).not.toHaveURL(/\/signin/);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Meet the Founder' })).toBeVisible();
    await expect(page).toHaveURL(/\/our-team$/);
  });

  test('renders the founder name and role', async ({ page }) => {
    await gotoOurTeam(page);

    await expect(page.getByRole('heading', { level: 2, name: 'Aditya Kumar' })).toBeVisible();
    await expect(page.getByText('Founder & Product Engineer')).toBeVisible();
  });

  test('states plainly that Sadhya is built independently', async ({ page }) => {
    await gotoOurTeam(page);

    await expect(page.getByRole('heading', { name: 'Built from the ground up.' })).toBeVisible();
    await expect(page.getByText(/currently being built independently/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /There.s more to build\./ })).toBeVisible();
  });

  test('renders the six build cards, each labelled live or in progress', async ({ page }) => {
    await gotoOurTeam(page);

    const section = page.locator('section', { has: page.getByRole('heading', { name: /What I.m building/ }) });
    for (const title of [
      'Syllabus Intelligence',
      'Authentic PYQs',
      'Student Mastery',
      'Personalized Planning',
      'AI Learning',
      'Student Community',
    ]) {
      await expect(section.getByRole('heading', { name: title })).toBeVisible();
    }

    // Nothing unbuilt may be presented as shipped: every card carries an explicit status.
    const statuses = section.locator('article').locator('text=/^(Live today|Building toward)$/');
    await expect(statuses).toHaveCount(6);
    await expect(section.getByText('Building toward').first()).toBeVisible();
  });

  test('does not render an empty team or advisors section', async ({ page }) => {
    await gotoOurTeam(page);

    // TEAM and ADVISORS are empty, so their headings must be absent entirely — a "Team"
    // heading over nothing is exactly the fake-team failure this page exists to avoid.
    await expect(page.getByRole('heading', { name: 'The team' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Advisors' })).toHaveCount(0);
  });

  test('CTA links point at routes that exist, and navigate', async ({ page }) => {
    await gotoOurTeam(page);

    const explore = page.getByRole('link', { name: 'Explore Sadhya' }).first();
    await expect(explore).toHaveAttribute('href', '/how-it-works');
    await expect(page.getByRole('link', { name: 'Join the Community' })).toHaveAttribute('href', '/community');
    await expect(page.getByRole('link', { name: 'Be part of the journey' })).toHaveAttribute('href', '/contact');
    await expect(page.getByRole('link', { name: 'Get in touch' }).first()).toHaveAttribute('href', '/contact');

    await explore.click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('has no broken internal links', async ({ page }) => {
    await gotoOurTeam(page);

    const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) =>
      Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''))).filter(
        (h) => h && h !== '/',
      ),
    );
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of hrefs) {
      await page.goto(href);
      // "/" means the catch-all fired, i.e. the route does not exist. /signin means the
      // route exists behind the auth gate, which is correct behaviour when signed out.
      const landed = new URL(page.url()).pathname;
      expect(landed === '/' ? `BROKEN: ${href}` : href).toBe(href);
    }
  });

  test('exposes page-specific SEO metadata', async ({ page }) => {
    await gotoOurTeam(page);

    await expect(page).toHaveTitle('Meet the Founder | Sadhya');

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /Aditya Kumar/);
    await expect(description).toHaveAttribute('content', /founder/i);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Meet the Founder | Sadhya',
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://sadhya.app/our-team',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://sadhya.app/our-team',
    );
  });

  test('uses a correct heading hierarchy', async ({ page }) => {
    await gotoOurTeam(page);

    await expect(page.locator('main h1')).toHaveCount(1);
    // No h3 may appear before the first h2 — the card headings all sit under a section.
    const levels = await page
      .locator('main h1, main h2, main h3')
      .evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((lvl, i) => expect(lvl - levels[i]).toBeLessThanOrEqual(1));
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoOurTeam(page);
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });
});

test.describe('/our-team — dark mode', () => {
  test('renders dark end to end — no light-only surface survives', async ({ page }) => {
    await gotoOurTeam(page, 'dark');
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Every surface the page paints, from the ground up. A hardcoded light background
    // anywhere in this list shows up as a bright panel punched into a dark page.
    const surfaces: [string, Locator][] = [
      ['page ground', page.locator('main')],
      ['founder card', page.getByRole('heading', { level: 2, name: 'Aditya Kumar' })],
      ['build card', page.getByRole('heading', { name: 'Syllabus Intelligence' })],
      ['philosophy panel', page.getByText('What is in the syllabus?')],
      ['footer', page.locator('footer')],
    ];
    for (const [name, locator] of surfaces) {
      const rgb = await renderedBackground(locator);
      expect(luminance(rgb), `${name} rendered as rgb(${rgb})`).toBeLessThan(0.05);
    }
  });

  test('keeps text legible in dark mode', async ({ page }) => {
    await gotoOurTeam(page, 'dark');

    await expectReadable(page.getByRole('heading', { level: 1 }), 3); // large text → AA is 3:1
    await expectReadable(page.getByRole('heading', { level: 2, name: 'Aditya Kumar' }), 3);
    await expectReadable(page.getByText('Founder & Product Engineer'));
    await expectReadable(page.getByText(/Building Sadhya across product, engineering/));
    await expectReadable(page.getByText('What is in the syllabus?'));
  });

  test('keeps text legible in light mode', async ({ page }) => {
    await gotoOurTeam(page, 'light');

    await expectReadable(page.getByRole('heading', { level: 1 }), 3);
    await expectReadable(page.getByText('Founder & Product Engineer'));
    await expectReadable(page.getByText(/Building Sadhya across product, engineering/));
    await expectReadable(page.getByText('What is in the syllabus?'));
  });
});

test.describe('/our-team — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('stacks without horizontal overflow and keeps CTAs touch-sized', async ({ page }) => {
    await gotoOurTeam(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Founder identity has to be readable immediately, not below three screens of hero.
    await expect(page.getByRole('heading', { level: 2, name: 'Aditya Kumar' })).toBeVisible();
    await expect(page.getByText('Founder & Product Engineer')).toBeVisible();

    const cta = page.getByRole('link', { name: 'Explore Sadhya' }).first();
    const box = await cta.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('/our-team — tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('lays out without horizontal overflow', async ({ page }) => {
    await gotoOurTeam(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('global footer', () => {
  // The link lives in SiteFooter, so it must appear on every public page — not only the
  // one it points at. /about and / are checked as representatives.
  for (const path of ['/our-team', '/about', '/']) {
    test(`carries an "Our Team" link to /our-team on ${path}`, async ({ page }) => {
      await page.goto(path);
      const link = page.locator('footer').getByRole('link', { name: 'Our Team', exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/our-team');
    });
  }

  test('the footer link reaches the page', async ({ page }) => {
    await page.goto('/about');
    await page.locator('footer').getByRole('link', { name: 'Our Team', exact: true }).click();
    await expect(page).toHaveURL(/\/our-team$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Meet the Founder' })).toBeVisible();
  });
});
