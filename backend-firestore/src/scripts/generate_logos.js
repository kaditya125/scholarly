const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '../../../frontend/public');
const artifactDir = 'C:\\Users\\aditya kumar\\.gemini\\antigravity\\brain\\642965e8-bbaf-43e1-bd0a-c6225637bf53';

// 1. Stacked Lockup (Icon on top + "Sadhya" below) - Square 512x512
const svgStackedDark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#181820"/>
      <stop offset="100%" stop-color="#08080a"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" fill="url(#bgGlow)"/>

  <!-- Mountain Peak Icon Group -->
  <g transform="translate(146, 75) scale(9.16)">
    <circle cx="17.8" cy="5.4" r="2.6" fill="#c8e558" filter="url(#glow)"/>
    <path d="M2.6 20.4l6.2-8.4 3.6 4.6" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.4 20.4l4.2-5.4 4.8 5.4" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
  </g>

  <!-- "Sadhya" Typography -->
  <text x="256" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="-1.5">Sadhya</text>

  <!-- Tagline -->
  <text x="256" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="500" fill="#c8e558" text-anchor="middle" letter-spacing="1.2">EVERY GOAL, ATTAINABLE</text>
</svg>
`;

// 2. Clean Stacked Lockup without Tagline (Icon + "Sadhya") - 512x512 & 120x120
const svgStackedClean = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgGlowClean" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1c1c24"/>
      <stop offset="100%" stop-color="#08080a"/>
    </radialGradient>
    <filter id="glowClean" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" fill="url(#bgGlowClean)"/>

  <!-- Mountain Peak Icon Group -->
  <g transform="translate(136, 60) scale(10)">
    <circle cx="17.8" cy="5.4" r="2.6" fill="#c8e558" filter="url(#glowClean)"/>
    <path d="M2.6 20.4l6.2-8.4 3.6 4.6" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.4 20.4l4.2-5.4 4.8 5.4" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
  </g>

  <!-- "Sadhya" Typography -->
  <text x="256" y="405" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="76" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="-2">Sadhya</text>
</svg>
`;

// 3. Horizontal Banner Lockup (Icon on left + "Sadhya" on right) - 600x200
const svgHorizontalBanner = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200">
  <defs>
    <radialGradient id="bgGlowHoriz" cx="30%" cy="50%" r="80%">
      <stop offset="0%" stop-color="#1a1a22"/>
      <stop offset="100%" stop-color="#08080a"/>
    </radialGradient>
    <filter id="glowHoriz" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="600" height="200" fill="url(#bgGlowHoriz)"/>

  <!-- Mountain Peak Icon Group -->
  <g transform="translate(60, 40) scale(5)">
    <circle cx="17.8" cy="5.4" r="2.6" fill="#c8e558" filter="url(#glowHoriz)"/>
    <path d="M2.6 20.4l6.2-8.4 3.6 4.6" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.4 20.4l4.2-5.4 4.8 5.4" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
  </g>

  <!-- "Sadhya" Typography -->
  <text x="210" y="120" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="70" font-weight="700" fill="#ffffff" letter-spacing="-2">Sadhya</text>
  <text x="212" y="152" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#c8e558" letter-spacing="1">EVERY GOAL, ATTAINABLE</text>
</svg>
`;

async function generate() {
  const outputs = [
    { svg: svgStackedDark, name: 'sadhya-logo-with-name-tagline-512x512.png', width: 512, height: 512 },
    { svg: svgStackedClean, name: 'sadhya-logo-with-name-512x512.png', width: 512, height: 512 },
    { svg: svgStackedClean, name: 'sadhya-logo-with-name-120x120.png', width: 120, height: 120 },
    { svg: svgHorizontalBanner, name: 'sadhya-logo-horizontal-600x200.png', width: 600, height: 200 },
  ];

  for (const item of outputs) {
    const buffer = await sharp(Buffer.from(item.svg))
      .resize(item.width, item.height)
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();

    const publicPath = path.join(publicDir, item.name);
    fs.writeFileSync(publicPath, buffer);
    console.log('Saved:', publicPath);

    if (fs.existsSync(artifactDir)) {
      const artifactPath = path.join(artifactDir, item.name);
      fs.writeFileSync(artifactPath, buffer);
      console.log('Saved to artifact:', artifactPath);
    }
  }
}

generate().catch(console.error);
