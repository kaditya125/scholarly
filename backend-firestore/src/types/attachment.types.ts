/**
 * A file attached to a message (DM or group channel). Files are stored in Firebase Storage under
 * `public/attachments/{uid}/{id}/{name}` and served via a Firebase download URL.
 */
export interface Attachment {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;              // bytes
  kind: 'image' | 'file' | 'audio';    // drives rendering (thumbnail vs. file card vs. voice note)
  duration?: number;         // seconds for audio
  waveform?: number[];       // normalized visual audio waveform amplitude points [0..1]
}
