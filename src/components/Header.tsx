import React from 'react';
import type { RateLimitState } from '../types/jquants';
import { Settings, TrendingUp, AlertCircle, Clock } from 'lucide-react';

interface HeaderProps {
  rateLimit: RateLimitState;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ rateLimit, onOpenSettings }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20 px-3 py-2.5 sm:px-5 lg:px-6">
      <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">J-Quants 日本株分析</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-700/60">
                Lightプラン (遅延なし・5年)
              </span>
            </div>
            <p className="text-xs text-slate-400">J-Quants API (V2) 公式データ連携</p>
          </div>
        </div>

        {/* Status and Actions */}
        <div className="flex items-center gap-3">
          {/* Rate limit badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              rateLimit.isRateLimited
                ? 'bg-rose-950/40 text-rose-300 border-rose-800'
                : rateLimit.remainingThisMinute <= 2
                ? 'bg-amber-950/40 text-amber-300 border-amber-800'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
            }`}
            title="Freeプランのレート制限（5回/分）の消費状況です"
          >
            {rateLimit.isRateLimited ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            <span>
              API枠: <strong className="font-bold">{rateLimit.remainingThisMinute}</strong> / {rateLimit.maxPerMinute}
            </span>
            {rateLimit.nextResetSeconds > 0 && (
              <span className="text-[11px] opacity-80">({rateLimit.nextResetSeconds}s)</span>
            )}
          </div>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>設定</span>
          </button>
        </div>
      </div>
    </header>
  );
};
