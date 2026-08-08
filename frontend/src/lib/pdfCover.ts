/// <reference types="vite/client" />
// Renders page 1 of a PDF (as bytes) to a JPEG data URL, entirely client-side via pdfjs-dist.
// Used to give every book in the Documents catalog a real cover image. JPEG (not PNG) keeps the
// data URL small (~4-6x smaller) so many covers fit in the localStorage persistence cache.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Rasterizes page 1 of the given PDF bytes to a JPEG data URL at roughly `targetWidth` CSS
 * pixels wide (rendered at devicePixelRatio for crisp thumbnails on retina displays).
 */
export async function renderFirstPageDataUrl(data: ArrayBuffer, targetWidth = 320): Promise<string> {
  const pdf = await getDocument({ data }).promise;
  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (targetWidth / baseViewport.width) * dpr;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('Canvas 2D context unavailable');

    // Paint an opaque white background first — JPEG has no alpha, so any transparent regions
    // of the PDF page would otherwise turn black.
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    await (page.render as any)({ canvasContext, viewport, canvas, background: '#ffffff' }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    pdf.destroy();
  }
}
