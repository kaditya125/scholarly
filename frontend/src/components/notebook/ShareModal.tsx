import { useState } from 'react';
import { X, Copy, Mail, Link as LinkIcon, UserPlus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

interface ShareModalProps {
  notebookId: string;
  onClose: () => void;
}

export function ShareModal({ notebookId, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [linkCopied, setLinkCopied] = useState(false);

  const shareMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/notebooks/${notebookId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetEmailOrId: email, role })
      });
      if (!res.ok) throw new Error('Failed to share');
      return res.json();
    }
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/notebooks/${notebookId}/share-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role, expiresInHours: 24 })
      });
      if (!res.ok) throw new Error('Failed to generate link');
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-teal-500" />
            Share Notebook
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Email Invite */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Invite via Email</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input 
                  type="email" 
                  placeholder="friend@scholarly.ai" 
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <select 
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <button 
              onClick={() => shareMutation.mutate()}
              disabled={!email || shareMutation.isPending}
              className="w-full py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 transition disabled:opacity-50"
            >
              {shareMutation.isPending ? 'Sending Invite...' : 'Send Invite'}
            </button>
            {shareMutation.isSuccess && <p className="text-green-500 text-sm">Invite sent successfully!</p>}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-slate-900 text-slate-500">Or</span>
            </div>
          </div>

          {/* Secure Link */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Create Secure Link (Expires in 24h)</label>
            <button 
              onClick={() => linkMutation.mutate()}
              disabled={linkMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              {linkCopied ? <Copy className="w-4 h-4 text-green-500" /> : <LinkIcon className="w-4 h-4" />}
              {linkCopied ? 'Link Copied to Clipboard!' : 'Generate Shareable Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
