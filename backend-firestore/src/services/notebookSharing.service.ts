import { NotebookRepository } from '../repositories/notebook.repository';
import { Notebook } from '../types/notebook';
import crypto from 'crypto';

export class NotebookSharingService {
  private repo = new NotebookRepository();

  /**
   * Adds an editor or viewer by User ID / Email ID directly
   */
  async shareWithUser(notebookId: string, ownerId: string, targetUserEmailOrId: string, role: 'viewer' | 'editor'): Promise<Notebook> {
    const notebook = await this.repo.getNotebook(ownerId, notebookId);
    
    if (!notebook) {
      throw new Error('Notebook not found or you are not the owner');
    }

    if (role === 'viewer') {
      if (!notebook.viewers.includes(targetUserEmailOrId)) {
        notebook.viewers.push(targetUserEmailOrId);
      }
    } else if (role === 'editor') {
      if (!notebook.editors.includes(targetUserEmailOrId)) {
        notebook.editors.push(targetUserEmailOrId);
      }
    }

    // Add Audit Log
    notebook.auditLogs = notebook.auditLogs || [];
    notebook.auditLogs.push({
      userId: ownerId,
      action: 'SHARED_NOTEBOOK',
      timestamp: Date.now(),
      details: { target: targetUserEmailOrId, role }
    });

    await this.repo.updateNotebook(ownerId, notebookId, notebook);
    return notebook;
  }

  /**
   * The counterpart `shareWithUser` never had. Removes a target from both `viewers` and
   * `editors` — defensively both, rather than requiring the caller to remember which role was
   * originally granted, since the two access grants (viewer for class resources, whatever else
   * calls this later) can only ever be additive today.
   *
   * A no-op, not an error, if the target holds no access — revoking twice (e.g. a student who
   * leaves a class they had already left) must not throw.
   */
  async revokeAccess(notebookId: string, ownerId: string, targetUserId: string): Promise<void> {
    const notebook = await this.repo.getNotebook(ownerId, notebookId);
    if (!notebook) {
      throw new Error('Notebook not found or you are not the owner');
    }

    const viewerIdx = notebook.viewers.indexOf(targetUserId);
    const editorIdx = notebook.editors.indexOf(targetUserId);
    if (viewerIdx === -1 && editorIdx === -1) return;

    if (viewerIdx !== -1) notebook.viewers.splice(viewerIdx, 1);
    if (editorIdx !== -1) notebook.editors.splice(editorIdx, 1);

    notebook.auditLogs = notebook.auditLogs || [];
    notebook.auditLogs.push({
      userId: ownerId,
      action: 'REVOKED_NOTEBOOK_ACCESS',
      timestamp: Date.now(),
      details: { target: targetUserId },
    });

    await this.repo.updateNotebook(ownerId, notebookId, notebook);
  }

  /**
   * Generates a secure share link
   */
  async generateSecureShareLink(notebookId: string, ownerId: string, role: 'viewer' | 'editor', expiresInHours: number = 24): Promise<string> {
    // In a real app, you would store this token in a separate `share_links` collection
    // along with expiration and optional password hash.
    // For this prototype, we mock the link generation.
    const token = crypto.randomBytes(16).toString('hex');
    
    const notebook = await this.repo.getNotebook(ownerId, notebookId);
    if (!notebook) throw new Error('Notebook not found');

    notebook.auditLogs = notebook.auditLogs || [];
    notebook.auditLogs.push({
      userId: ownerId,
      action: 'GENERATED_SHARE_LINK',
      timestamp: Date.now(),
      details: { role, expiresAt: Date.now() + (expiresInHours * 3600000) }
    });
    
    await this.repo.updateNotebook(ownerId, notebookId, notebook);

    return `https://sadhya.app/shared/${notebookId}?token=${token}`;
  }

  /**
   * Fetches all notebooks where the user is an owner, editor, or viewer
   */
  async getAccessibleNotebooks(userId: string): Promise<Notebook[]> {
    // In Firestore, this requires multiple queries or a single query with array-contains-any
    // Currently NotebookRepository `getNotebooks` only fetches by ownerId.
    // We will simulate fetching shared by grabbing all notebooks for now 
    // (In production: db.collection('notebooks').where('viewers', 'array-contains', userId))
    return []; // Placeholder until repo is updated
  }
}
