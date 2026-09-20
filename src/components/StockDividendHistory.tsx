import React from 'react';
import type { DividendHistoryItem } from '../types/jquants';
import { formatPercent } from '../utils/formatters';
import {
  TrendingUp,
  Flame,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  PieChart,
} from 'lucide-react';

interface StockDividendHistoryProps {
  history: DividendHistoryItem[];
  consecutiveGrowthYears: number;
  currentYield: number | null;
}

export const StockDividendHistory: React.FC<StockDividendHistoryProps> = ({
  history,
  consecutiveGrowthYears,
  currentYield,
}) => {
  if (!history || history.length === 0) {
    return null;
  }

  // バーグラフの最大値を計算（バーの相対高さ計算用）
  const maxDps = Math.max(...history.map((h) => h.dps), 1);
  const latest = history[history.length - 1];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6 animate-in fade-in duration-200">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>年間配当金の推移・配当性向</span>
              {consecutiveGrowthYears >= 2 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  <Flame className="w-3.5 h-3.5 fill-current text-amber-400" />
                  <span>{consecutiveGrowthYears}期連続増配</span>
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">決算短信サマリーに基づく過去実績および最新会社予想</p>
          </div>
        </div>

        {/* 直近情報サマリー */}
        <div className="flex items-center gap-4 text-xs">
          {latest && (
            <div className="text-right">
              <span className="text-slate-500 block">直近年間配当 (1株)</span>
              <span className="text-base font-bold text-white font-mono">
                {latest.dps}円
                {latest.isForecast && <span className="text-xs text-amber-400 ml-1">(予)</span>}
              </span>
            </div>
          )}
          {currentYield != null && (
            <div className="text-right pl-3 border-l border-slate-800">
              <span className="text-slate-500 block">予想配当利回り</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                {formatPercent(currentYield)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 配当推移バーグラフ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span>年間配当金の推移 (円)</span>
          </span>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
              <span>増配</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block"></span>
              <span>据置</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span>
              <span>減配</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-dashed border-indigo-300 bg-indigo-500/40 inline-block"></span>
              <span>会社予想</span>
            </span>
          </div>
        </div>

        {/* 棒グラフ本体 */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 pt-8">
          <div className="grid grid-flow-col auto-cols-fr gap-2 sm:gap-4 items-end h-44">
            {history.map((item, idx) => {
              // 高さパーセンテージ (最低12%は確保)
              const heightPct = Math.max(12, Math.round((item.dps / maxDps) * 100));
              const isIncrease = item.changeAmount != null && item.changeAmount > 0;
              const isDecrease = item.changeAmount != null && item.changeAmount < 0;

              let barColor = 'bg-indigo-500';
              if (item.isForecast) {
                barColor = 'bg-indigo-500/70 border border-dashed border-indigo-300 shadow-indigo-500/10';
              } else if (isIncrease) {
                barColor = 'bg-emerald-500 shadow-emerald-500/20';
              } else if (isDecrease) {
                barColor = 'bg-rose-500 shadow-rose-500/20';
              }

              return (
                <div key={idx} className="flex flex-col items-center h-full justify-end group">
                  {/* 金額 & 前期比 */}
                  <div className="mb-2 text-center transition group-hover:-translate-y-0.5">
                    <span className="block font-mono text-xs font-bold text-white whitespace-nowrap">
                      {item.dps}円
                    </span>
                    {item.changePercent != null && (
                      <span
                        className={`text-[10px] font-mono block ${
                          isIncrease ? 'text-emerald-400' : isDecrease ? 'text-rose-400' : 'text-slate-500'
                        }`}
                      >
                        {isIncrease ? `+${formatPercent(item.changePercent, 1)}` : formatPercent(item.changePercent, 1)}
                      </span>
                    )}
                  </div>

                  {/* バー */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[56px] rounded-t-lg transition-all duration-300 group-hover:brightness-110 shadow-lg ${barColor}`}
                  ></div>

                  {/* 決算期ラベル */}
                  <div className="mt-2.5 text-center">
                    <span className="block text-xs font-semibold text-slate-200 whitespace-nowrap">
                      {item.periodLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      <div className="mt-4 pt-3 border-t border-slate-800/80">
        <span className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>決算期別 配当・業績推移</span>
        </span>

        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-200 font-semibold">
                <th className="py-2.5 px-3 font-semibold">決算期</th>
                <th className="py-2.5 px-3 font-semibold text-right">年間配当 (1株)</th>
                <th className="py-2.5 px-3 font-semibold text-right">前期比</th>
                <th className="py-2.5 px-3 font-semibold text-right">
                  <div className="flex items-center justify-end gap-1">
                    <PieChart className="w-3 h-3 text-indigo-400" />
                    <span>配当性向</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold text-right">1株利益 (EPS)</th>
                <th className="py-2.5 px-3 font-semibold text-right">開示日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {[...history].reverse().map((item, idx) => {
                const isIncrease = item.changeAmount != null && item.changeAmount > 0;
                const isDecrease = item.changeAmount != null && item.changeAmount < 0;

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-800/40 transition ${
                      item.isForecast ? 'bg-indigo-950/10' : ''
                    }`}
                  >
                    {/* 決算期 */}
                    <td className="py-2 px-3 font-sans font-medium text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{item.periodLabel}</span>
                        {item.isForecast && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-sans">
                            予想
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 年間配当 */}
                    <td className="py-2 px-3 text-right font-bold text-white">
                      {item.dps}円
                    </td>

                    {/* 前期比 */}
                    <td className="py-2 px-3 text-right">
                      {item.changeAmount != null ? (
                        <div
                          className={`flex items-center justify-end gap-0.5 ${
                            isIncrease
                              ? 'text-emerald-400 font-semibold'
                              : isDecrease
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isIncrease ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : isDecrease ? (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          ) : (
                            <Minus className="w-3 h-3 text-slate-500" />
                          )}
                          <span>
                            {isIncrease ? `+${item.changeAmount}円` : `${item.changeAmount}円`}
                          </span>
                          {item.changePercent != null && (
                            <span className="text-[11px] opacity-80 ml-0.5">
                              ({isIncrease ? `+${formatPercent(item.changePercent, 1)}` : formatPercent(item.changePercent, 1)})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* 配当性向 */}
                    <td className="py-2 px-3 text-right text-slate-300">
                      {item.payoutRatio != null ? (
                        <span
                          className={`font-semibold ${
                            item.payoutRatio >= 50
                              ? 'text-amber-400'
                              : item.payoutRatio >= 30
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatPercent(item.payoutRatio, 1)}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* EPS */}
                    <td className="py-2 px-3 text-right text-slate-300">
                      {item.eps != null ? `${item.eps.toFixed(1)}円` : '-'}
                    </td>

                    {/* 開示日 */}
                    <td className="py-2 px-3 text-right text-slate-500 text-[11px] font-sans">
                      {item.discDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
