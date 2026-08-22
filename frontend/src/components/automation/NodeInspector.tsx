/**
 * @file NodeInspector.tsx
 * @description Right sidebar inspector to configure parameters for the currently selected workflow node.
 */

import React from 'react';
import { X, Trash2, Sliders } from 'lucide-react';
import { WorkflowNodeConfig } from '../../lib/api/automations';

interface NodeInspectorProps {
  selectedNode: WorkflowNodeConfig | null;
  onUpdateConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  onUpdateConfig,
  onDeleteNode,
  onClose
}) => {
  if (!selectedNode) return null;

  const handleChange = (key: string, value: any) => {
    const updated = {
      ...selectedNode.config,
      [key]: value
    };
    onUpdateConfig(selectedNode.id, updated);
  };

  return (
    <div className="w-80 border-l border-slate-200 dark:border-white/10 bg-white dark:bg-[#18191A] flex flex-col h-full shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {selectedNode.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body & Configuration Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Node ID
          </label>
          <input
            type="text"
            value={selectedNode.id}
            disabled
            className="w-full px-3 py-1.5 text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Node Type
          </label>
          <input
            type="text"
            value={selectedNode.type}
            disabled
            className="w-full px-3 py-1.5 text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 font-mono"
          />
        </div>

        {/* Dynamic Fields for specific types */}
        {selectedNode.type === 'CONDITION_IF' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Evaluation Field
              </label>
              <input
                type="text"
                placeholder="e.g. averageMastery or accuracy"
                value={(selectedNode.config.field as string) || ''}
                onChange={e => handleChange('field', e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Operator
              </label>
              <select
                value={(selectedNode.config.operator as string) || 'less_than'}
                onChange={e => handleChange('operator', e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
              >
                <option value="less_than">Less Than (&lt;)</option>
                <option value="greater_than">Greater Than (&gt;)</option>
                <option value="equals">Equals (==)</option>
                <option value="not_equals">Not Equals (!=)</option>
                <option value="contains">Contains</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Comparison Target Value
              </label>
              <input
                type="text"
                placeholder="e.g. 0.6 or 60"
                value={(selectedNode.config.value as string) || ''}
                onChange={e => handleChange('value', Number(e.target.value) || e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </>
        )}

        {selectedNode.type === 'GENERATE_PRACTICE_QUIZ' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Question Count
            </label>
            <input
              type="number"
              min={1}
              max={25}
              value={(selectedNode.config.questionCount as number) || 5}
              onChange={e => handleChange('questionCount', parseInt(e.target.value, 10))}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
            />
          </div>
        )}

        {selectedNode.type === 'FLOW_WAIT' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Wait Duration (Minutes)
            </label>
            <input
              type="number"
              min={1}
              value={(selectedNode.config.durationMinutes as number) || 1440}
              onChange={e => handleChange('durationMinutes', parseInt(e.target.value, 10))}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
            />
            <p className="text-[11px] text-slate-400 mt-1">1440 minutes = 24 hours</p>
          </div>
        )}

        {selectedNode.type === 'SEND_IN_APP_NOTIFICATION' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Notification Title
              </label>
              <input
                type="text"
                placeholder="Alert Title"
                value={(selectedNode.config.title as string) || ''}
                onChange={e => handleChange('title', e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Message Body
              </label>
              <textarea
                rows={3}
                placeholder="Notification body message..."
                value={(selectedNode.config.body as string) || ''}
                onChange={e => handleChange('body', e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </>
        )}
      </div>

      {/* Footer / Delete */}
      <div className="p-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Node
        </button>
      </div>
    </div>
  );
};
