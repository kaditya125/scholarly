import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('react-router') || id.includes('react-dom') || id.includes('react/') || id.includes('zustand') || id.includes('clsx') || id.includes('tailwind-merge')) {
                return 'vendor-react-core';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react') || id.includes('@lobehub/icons')) {
                return 'vendor-icons';
              }
              if (id.includes('recharts') || id.includes('d3') || id.includes('dagre') || id.includes('react-force-graph')) {
                return 'vendor-charts';
              }
              if (id.includes('katex') || id.includes('remark') || id.includes('rehype') || id.includes('react-markdown')) {
                return 'vendor-katex-markdown';
              }
              if (id.includes('@xyflow') || id.includes('mermaid')) {
                return 'vendor-diagrams';
              }
              if (id.includes('pdfjs-dist') || id.includes('tesseract') || id.includes('mammoth')) {
                return 'vendor-docs-ocr';
              }
              if (id.includes('@google/genai') || id.includes('axios')) {
                return 'vendor-network-ai';
              }
            }
          },
        },
      },
    },
  };
});
