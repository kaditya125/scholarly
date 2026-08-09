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
  kind: 'image' | 'file';    // drives rendering (thumbnail vs. file card)
}
