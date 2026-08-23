import { api } from './client';

export interface Attachment {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  kind: 'image' | 'file' | 'audio';
  duration?: number;
  waveform?: number[];
}

export const uploadsApi = {
  /** Uploads a single file and returns its stored attachment metadata. */
  async attachment(file: File, onUploadProgress?: (e: any) => void): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/uploads/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
    return data;
  },
};
