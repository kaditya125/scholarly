# The one nginx directive the SEO prerender depends on

`scripts/seo-prerender.ts` writes one file per public route:

```
dist/pricing/index.html
dist/exams/neet/index.html
dist/blog/how-voice-mode-works/index.html
```

For that to reach a crawler at `https://sadhya.app/pricing`, nginx has to serve
`dist/pricing/index.html` **at that exact URL** — not at `/pricing/`.

## Why the current directive is not enough

Live config (`/etc/nginx/sites-enabled/sadhya`):

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

`$uri` tests for a *file*, so `/pricing` misses. `$uri/` tests for a *directory*, hits, and
nginx's index module answers with a **301 to the trailing-slash form**. Measured against
production before this change, on the two directories that already exist in `dist/`:

```
GET https://sadhya.app/media   -> 301  https://sadhya.app/media/
GET https://sadhya.app/assets  -> 301  https://sadhya.app/assets/
```

Shipping the prerendered files without changing this would move the problem rather than fix
it. The sitemap and every canonical say `/pricing`; Google would request `/pricing`, get a
301 to `/pricing/`, and the page would leave "Alternative page with proper canonical tag"
only to arrive in "Page with redirect". The 13 already-indexed URLs are slash-less, so
switching the whole site to trailing slashes to accommodate nginx would churn them for no
gain.

## The change

Insert `$uri/index.html` **before** `$uri/`:

```nginx
location / {
    # $uri/index.html must come before $uri/. Without it, /pricing misses the file test,
    # matches the directory test, and nginx 301s to /pricing/ — which is not the URL in the
    # sitemap or in the page's own rel=canonical. With it, dist/pricing/index.html is served
    # directly at /pricing with a 200.
    try_files $uri $uri/index.html $uri/ /index.html;
}
```

## What it does not change

- `/assets/index-<hash>.js` — matches `$uri` on the first test, exactly as before.
- `/media` — has no `index.html`, so it falls past the new test to `$uri/` and still 301s.
  Unchanged behaviour for asset directories.
- `/dashboard`, `/chat`, any unknown URL — no file and no directory, so it still falls through
  to `/index.html` and the SPA shell. Unchanged.
- `/` — resolves to `dist/index.html` either way, with no redirect before or after.

## Order matters: nginx FIRST, then deploy

These two changes must not be shipped the other way round, and deploying the build alone is
worse than deploying nothing.

Today `dist/pricing` does not exist, so `/pricing` fails both the file and the directory test
and falls through to `/index.html` — a 200, with the wrong canonical. The moment the prerender
ships, `dist/pricing/` **does** exist, so under the current directive `/pricing` starts matching
`$uri/` and **every public URL on the site begins answering 301**. Applying the directive first
is safe and inert: with no prerendered directories present yet, `$uri/index.html` matches
nothing and behaviour is identical to today.

1. Apply the nginx directive, `nginx -t`, reload. Site behaviour unchanged.
2. Deploy the frontend (`git pull && npm ci && npm run build`). Prerendered files appear and
   are served at their slash-less URLs.

## Applying it

```bash
sudo cp /etc/nginx/sites-enabled/sadhya /etc/nginx/sites-enabled/sadhya.bak-$(date +%F)
sudo sed -i 's|try_files \$uri \$uri/ /index.html;|try_files $uri $uri/index.html $uri/ /index.html;|' /etc/nginx/sites-enabled/sadhya
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` before the reload is the safety gate: a config that fails to parse is never loaded,
and `reload` keeps the old workers serving until the new ones are up, so there is no window
where the site is down.

## Rolling back

```bash
sudo cp /etc/nginx/sites-enabled/sadhya.bak-<date> /etc/nginx/sites-enabled/sadhya
sudo nginx -t && sudo systemctl reload nginx
```

## Verifying

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://sadhya.app/pricing
curl -sS https://sadhya.app/pricing | grep -o '<link rel="canonical"[^>]*>'
```

Expected: `200` with an empty redirect, and `href="https://sadhya.app/pricing"`.
