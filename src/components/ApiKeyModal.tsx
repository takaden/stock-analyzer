import React, { useState } from 'react';
import { cacheService } from '../services/cacheService';
import { X, Key, Trash2, CheckCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyUpdated: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onApiKeyUpdated }) => {
  const [apiKey, setApiKey] = useState<string>(cacheService.getApiKey());
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    cacheService.setApiKey(apiKey);
    setMessage({ text: 'APIキーを保存しました', type: 'success' });
    onApiKeyUpdated();
    setTimeout(() => {
      setMessage(null);
      onClose();
    }, 800);
  };

  const handleClearCache = () => {
    cacheService.clearAllStockCache();
    setMessage({ text: 'ローカルキャッシュをすべて削除しました', type: 'info' });
    setTimeout(() => setMessage(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Key className="w-5 h-5 text-indigo-400" />
            <span>環境・API設定</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              J-Quants API (V2) APIキー
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="APIキーを入力..."
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              ※ J-Quantsダッシュボードで発行したAPIキーを入力します。ブラウザのローカルストレージにのみ保存されます。
            </p>
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800'
                  : 'bg-indigo-950/50 text-indigo-300 border border-indigo-800'
              }`}
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClearCache}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition"
              title="保存されている銘柄キャッシュをリセットします"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>キャッシュ削除</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
              >
                保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
