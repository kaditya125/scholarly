/**
 * Downscale a data URL to a compact JPEG (white background, since JPEG has no alpha). Used to keep
 * saved doubt images small enough to live directly in Firestore — a full crop for the detail view
 * (~900px) and a tiny thumbnail for list cards (~240px).
 */
export function resizeDataUrl(dataUrl: string, maxWidth: number, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / (img.width || maxWidth));
        const w = Math.max(1, Math.round((img.width || maxWidth) * scale));
        const h = Math.max(1, Math.round((img.height || maxWidth) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e as Error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for resize'));
    img.src = dataUrl;
  });
}
