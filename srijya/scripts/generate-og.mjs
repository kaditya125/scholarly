/**
 * Generates the site's own brand images: og.png (1200×630 social card) and the
 * two PNG app icons, all from SVG defined here.
 *
 * These are build-once assets that are committed, not part of `npm run build` —
 * which is why this script borrows `sharp` from the sibling backend workspace
 * rather than adding an image-processing dependency to a static marketing site
 * that will never resize an image at runtime.
 *
 * A note on type: the renderer uses fonts installed on the machine, and Manrope
 * (loaded by the site itself from Google Fonts) generally is not one of them.
 * The stack therefore falls back to a system grotesque. That is fine for a social
 * card — it is a picture of the brand, not the brand's typography — but it is why
 * the card is not simply a screenshot of the page.
 *
 *   node scripts/generate-og.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '..', 'public');

/* Wherever sharp happens to live in this monorepo. */
const CANDIDATES = [
  'sharp',
  '../backend-firestore/node_modules/sharp/dist/index.mjs',
  '../../backend-firestore/node_modules/sharp/dist/index.mjs',
];

async function loadSharp() {
  const require = createRequire(import.meta.url);
  for (const candidate of CANDIDATES) {
    try {
      if (candidate === 'sharp') return require(candidate);
      const url = new URL(candidate, import.meta.url);
      return (await import(url.href)).default;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'sharp could not be found. Install it (npm i -D sharp) or run this from a checkout that has it.'
  );
}

const INK = '#14161a';
const INK_2 = '#4c525b';
const INK_3 = '#7c838d';
const PAPER = '#fbfaf8';
const LINE = '#e5e2db';
const ACCENT = '#3a46d6';
const FONT = "Manrope, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";

/** The loom mark, positioned and scaled. Same geometry as the site's component. */
const mark = (x, y, size, colour, width) => {
  const s = size / 24;
  const t = `translate(${x} ${y}) scale(${s})`;
  return `<g transform="${t}" stroke="${colour}" stroke-width="${width / s}" stroke-linecap="square" fill="none">
    <path d="M8.5 2.5v12.4M8.5 19.1v2.4"/>
    <path d="M15.5 2.5v2.4M15.5 9.1v12.4"/>
    <path d="M2.5 7h3.9M10.6 7h10.9"/>
    <path d="M2.5 17h10.9M17.6 17h3.9"/>
  </g>`;
};

/** The woven field, used as a quiet background on the right of the card. */
function loomField() {
  const warp = [];
  for (let x = 690; x <= 1200; x += 20) {
    warp.push(`<line x1="${x}" y1="0" x2="${x}" y2="630" stroke="${INK}" stroke-opacity="0.06"/>`);
  }
  const weft = [];
  for (let y = 30; y <= 630; y += 38) {
    weft.push(`<line x1="690" y1="${y}" x2="1200" y2="${y}" stroke="${INK}" stroke-opacity="0.05"/>`);
  }
  const nodes = [
    [790, 182],
    [950, 258],
    [1090, 372],
    [870, 448],
  ]
    .map(
      ([x, y], index) =>
        `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${
          index % 2 === 0 ? ACCENT : INK
        }" fill-opacity="${index % 2 === 0 ? 0.75 : 0.35}"/>`
    )
    .join('');
  /* Masked so the field dissolves toward the headline instead of ending on a
     hard vertical seam at its first thread. */
  return `<defs>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000"/>
        <stop offset="0.34" stop-color="#fff"/>
      </linearGradient>
      <mask id="field-mask">
        <rect x="660" y="0" width="540" height="630" fill="url(#fade)"/>
      </mask>
    </defs>
    <g mask="url(#field-mask)">${warp.join('')}${weft.join('')}${nodes}</g>`;
}

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  ${loomField()}

  ${mark(80, 64, 40, INK, 1.9)}
  <text x="136" y="84" font-family="${FONT}" font-size="21" font-weight="600" letter-spacing="1.5" fill="${INK}">SRIJYA</text>
  <text x="137" y="105" font-family="${FONT}" font-size="11" font-weight="500" letter-spacing="4.6" fill="${INK_3}">SYSTEMS</text>

  <text x="80" y="330" font-family="${FONT}" font-size="78" font-weight="500" letter-spacing="-2.6" fill="${INK}">Turning ideas</text>
  <text x="80" y="414" font-family="${FONT}" font-size="78" font-weight="500" letter-spacing="-2.6" fill="${INK}">into real technology.</text>

  <line x1="80" y1="486" x2="1120" y2="486" stroke="${LINE}" stroke-width="1"/>

  <text x="80" y="530" font-family="${FONT}" font-size="22" font-weight="400" letter-spacing="-0.3" fill="${INK_2}">Practical digital products, applications</text>
  <text x="80" y="562" font-family="${FONT}" font-size="22" font-weight="400" letter-spacing="-0.3" fill="${INK_2}">and intelligent technology.</text>

  <text x="1120" y="562" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="500" letter-spacing="2.2" fill="${INK_3}">CONSULTING · PRODUCT ENGINEERING</text>
</svg>`;

const iconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${INK}"/>
  <g stroke="${PAPER}" stroke-width="2.4" stroke-linecap="square" fill="none">
    <path d="M12 6v12.2M12 23.8V26"/>
    <path d="M20 6v2.2M20 13.8V26"/>
    <path d="M6 11h3.2M14.8 11H26"/>
    <path d="M6 21h11.2M22.8 21H26"/>
  </g>
</svg>`;

const sharp = await loadSharp();

await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, 'og.png'));
for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg(size)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, `icon-${size}.png`));
}

console.log('[srijya] Wrote public/og.png, public/icon-192.png, public/icon-512.png');
