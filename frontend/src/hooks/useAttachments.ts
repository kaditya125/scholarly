import { useState } from 'react';
import { uploadsApi, Attachment } from '../lib/api/uploads';

export interface PendingAttachment {
  tempId: string;
  name: string;
  size: number;
  uploading: boolean;
  error?: boolean;
  attachment?: Attachment;
}

const MAX_ATTACHMENTS = 10;

/**
 * Manages the attachments being composed for a message: selecting files, uploading them (each shows
 * its own progress), removing, and exposing the uploaded set ready to send.
 */
export function useAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const addFiles = async (files: FileList | File[]) => {
    const remaining = MAX_ATTACHMENTS - pending.length;
    if (remaining <= 0) return;
    const chosen = Array.from(files)
      .slice(0, remaining)
      .map((file) => ({ file, tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}` }));

    setPending((p) => [
      ...p,
      ...chosen.map(({ file, tempId }) => ({ tempId, name: file.name, size: file.size, uploading: true })),
    ]);

    await Promise.all(
      chosen.map(async ({ file, tempId }) => {
        try {
          const attachment = await uploadsApi.attachment(file);
          setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, uploading: false, attachment } : x)));
        } catch {
          setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, uploading: false, error: true } : x)));
        }
      })
    );
  };

  const remove = (tempId: string) => setPending((p) => p.filter((x) => x.tempId !== tempId));
  const clear = () => setPending([]);

  const addAudioFile = async (file: File, duration: number, waveform: number[]): Promise<Attachment> => {
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { tempId, name: file.name, size: file.size, uploading: true }]);
    try {
      const raw = await uploadsApi.attachment(file);
      const attachment: Attachment = {
        ...raw,
        kind: 'audio',
        duration,
        waveform,
      };
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, uploading: false, attachment } : x)));
      return attachment;
    } catch (e) {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, uploading: false, error: true } : x)));
      throw e;
    }
  };

  return {
    pending,
    addFiles,
    addAudioFile,
    remove,
    clear,
    ready: pending.filter((x) => x.attachment).map((x) => x.attachment as Attachment),
    uploading: pending.some((x) => x.uploading),
    hasPending: pending.length > 0,
  };
}
