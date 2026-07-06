import React from 'react';
import { createRoot } from 'react-dom/client';
import { pdf } from '@react-pdf/renderer';
import * as htmlToImage from 'html-to-image';
import { StudyGuidePDF } from '../components/export/StudyGuidePDF';
import MindMapViewer from '../components/assets/MindMapViewer';
import TimelineViewer from '../components/assets/TimelineViewer';
import { ExportSelection } from '../components/export/ExportDialog';

/**
 * Utility to snapshot a React component by rendering it in a hidden DOM node.
 */
async function snapshotComponent(Component: React.ReactElement, width = 1200, height = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create a hidden container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    // We need it in the document body so html-to-image can process it (and for React Flow to measure dimensions)
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(Component);

    // Wait for render and any internal layout algorithms (like dagre) to finish
    setTimeout(async () => {
      try {
        const dataUrl = await htmlToImage.toPng(container, {
          backgroundColor: '#ffffff',
          pixelRatio: 2,
        });
        root.unmount();
        document.body.removeChild(container);
        resolve(dataUrl);
      } catch (e) {
        root.unmount();
        document.body.removeChild(container);
        reject(e);
      }
    }, 1500); // 1.5s delay to ensure React Flow / Dagre finishes laying out
  });
}

export async function generateStudyGuidePDF(
  notebook: any,
  assets: any[],
  selection: ExportSelection,
  userName: string,
  onStateChange?: (state: string) => void
): Promise<void> {
  
  onStateChange?.('preparing');
  const diagramImages: Record<string, string> = {};

  // 1. Snapshot Diagrams
  onStateChange?.('rendering_diagrams');
  for (const asset of assets) {
    if (asset.type === 'MIND_MAP' && selection.mindMaps) {
      diagramImages[asset.id] = await snapshotComponent(
        <MindMapViewer assetData={asset} />, 
        1200, 
        800
      );
    }
    if (asset.type === 'TIMELINE' && selection.timelines) {
      diagramImages[asset.id] = await snapshotComponent(
        <TimelineViewer assetData={asset} />,
        1000,
        1200
      );
    }
  }

  // 2. Typeset Document
  onStateChange?.('rendering_layout');
  const doc = React.createElement(StudyGuidePDF, {
    notebook,
    assets,
    selection,
    diagramImages,
    userName
  });

  // 3. Generate PDF Blob
  onStateChange?.('generating_pdf');
  const asPdf = pdf();
  asPdf.updateContainer(doc);
  const blob = await asPdf.toBlob();

  // 4. Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${notebook.title || 'Study-Guide'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
