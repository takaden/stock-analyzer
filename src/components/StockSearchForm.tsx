import React, { useState, useEffect } from 'react';
import { Search, RotateCw, Star } from 'lucide-react';

export interface WatchlistStockOption {
  code: string;
  name: string;
}

interface StockSearchFormProps {
  onSearch: (code: string, forceRefresh?: boolean) => void;
  loading: boolean;
  currentCode?: string;
  watchlist?: WatchlistStockOption[];
}

export const StockSearchForm: React.FC<StockSearchFormProps> = ({
  onSearch,
  loading,
  currentCode,
  watchlist = [],
}) => {
  const [code, setCode] = useState(currentCode || '');

  useEffect(() => {
    if (currentCode) {
      setCode(currentCode);
    }
  }, [currentCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSearch(code.trim(), false);
    }
  };

  const handleStockClick = (selectedCode: string) => {
    setCode(selectedCode);
    onSearch(selectedCode, false);
  };

  const handleForceRefresh = () => {
    if (code.trim()) {
      onSearch(code.trim(), true);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            maxLength={5}
            placeholder="銘柄コード（例: 7203）"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium text-sm rounded-lg transition shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>取得中...</span>
              </>
            ) : (
              <span>データ取得</span>
            )}
          </button>

          {currentCode && (
            <button
              type="button"
              onClick={handleForceRefresh}
              disabled={loading}
              title="キャッシュを無視して最新データを再取得します"
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg transition border border-slate-700 flex items-center gap-1.5 text-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">再取得</span>
            </button>
          )}
        </div>
      </form>

      {/* ウォッチリスト登録銘柄のクイック選択 */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
          <span>ウォッチリスト:</span>
        </div>
        {watchlist && watchlist.length > 0 ? (
          watchlist.map((item) => {
            const isSelected = (currentCode || code) === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => handleStockClick(item.code)}
                disabled={loading}
                className={`text-xs px-2.5 py-1 rounded-md transition border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600'
                }`}
              >
                <span className="font-mono font-bold text-white">{item.code}</span>
                <span className={isSelected ? 'text-amber-200 font-medium' : 'text-slate-300'}>{item.name}</span>
              </button>
            );
          })
        ) : (
          <span className="text-xs text-slate-500 italic">
            登録銘柄はありません（右側の「ウォッチリストに追加」やスクリーニング画面から登録できます）
          </span>
        )}
      </div>
    </div>
  );
};
