import React from 'react';
import { LineChart, Filter, Star } from 'lucide-react';

export type ActiveTab = 'chart' | 'screener' | 'watchlist';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  watchlistCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  watchlistCount,
}) => {
  return (
    <div className="flex border-b border-slate-800 bg-slate-900/40 rounded-xl p-1 gap-1">
      <button
        onClick={() => onSelectTab('chart')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition duration-150 ${
          activeTab === 'chart'
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <LineChart className="w-4 h-4" />
        <span>個別チャート分析</span>
      </button>

      <button
        onClick={() => onSelectTab('screener')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition duration-150 ${
          activeTab === 'screener'
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <Filter className="w-4 h-4" />
        <span>銘柄スクリーニング</span>
      </button>

      <button
        onClick={() => onSelectTab('watchlist')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition duration-150 relative ${
          activeTab === 'watchlist'
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <Star className="w-4 h-4" />
        <span>ウォッチリスト比較</span>
        {watchlistCount > 0 && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold transition ${
              activeTab === 'watchlist'
                ? 'bg-white text-indigo-600'
                : 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
            }`}
          >
            {watchlistCount}
          </span>
        )}
      </button>
    </div>
  );
};
