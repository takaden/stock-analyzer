import React, { useMemo } from 'react';
import type { StockData } from '../types/jquants';
import {
  formatCurrency,
  formatPriceChange,
  formatPercent,
  formatRatio,
  formatMarketCap,
  formatVolume,
  formatDate,
} from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Building2,
  PieChart,
  BarChart3,
  Calendar,
  Database,
} from 'lucide-react';

interface StockSummaryCardProps {
  stock: StockData;
}

export const StockSummaryCard: React.FC<StockSummaryCardProps> = ({ stock }) => {
  const isUp = (stock.priceChange ?? 0) >= 0;

  // キャッシュから読まれたかどうかの判定 (作成から5秒以上経過)
  const isFromCache = Date.now() - stock.cachedAt > 5000;

  const betaAnalysis = stock.betaAnalysis;
  const cardTheme = useMemo(() => {
    if (!betaAnalysis) return null;
    if (betaAnalysis.category === 'defensive') {
      return {
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-950/20',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        text: 'text-emerald-400',
      };
    }
    if (betaAnalysis.category === 'cyclical') {
      return {
        border: 'border-amber-500/40',
        bg: 'bg-amber-950/20',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        text: 'text-amber-400',
      };
    }
    return {
      border: 'border-indigo-500/40',
      bg: 'bg-indigo-950/20',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      text: 'text-indigo-400',
    };
  }, [betaAnalysis]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Header Info: Name, Code, Market, Sector, Date */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xl font-bold text-indigo-400 bg-indigo-950/60 px-2.5 py-0.5 rounded border border-indigo-800/50">
              {stock.code}
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight">{stock.name}</h2>
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
              {stock.market}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800/60 text-slate-400 border border-slate-700/60">
              {stock.sector}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>データ基準日: {formatDate(stock.latestDate)}</span>
          </div>
          {isFromCache && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/60">
              <Database className="w-3 h-3" />
              キャッシュ表示
            </span>
          )}
        </div>
      </div>

      {/* Main KPIs: Price, Dividend Yield, Market Cap, Volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 1. 株価 */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="text-xs font-medium text-slate-400 mb-1">株価 (終値)</div>
          <div className="text-2xl font-bold text-white tracking-tight font-mono">
            {formatCurrency(stock.currentPrice)}
          </div>
          <div
            className={`flex items-center gap-1 text-xs font-medium mt-1 ${
              isUp ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{formatPriceChange(stock.priceChange, stock.priceChangePercent)}</span>
          </div>
        </div>

        {/* 2. 配当利回り */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
            <span>年間配当利回り</span>
            <Coins className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight font-mono">
            {formatPercent(stock.dividendYield)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            1株配当: <span className="text-white font-mono">{formatCurrency(stock.dpsAnnual)}</span>{' '}
            <span className="text-[10px] text-slate-500">
              ({stock.dpsType === 'forecast' ? '予想' : '実績'})
            </span>
          </div>
          {stock.dividendSchedule && (
            <div className="text-[11px] text-amber-300/90 font-medium mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400">確定月:</span>
              <span>{stock.dividendSchedule.recordMonthsLabel}</span>
            </div>
          )}
        </div>

        {/* 3. 時価総額 */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
            <span>時価総額</span>
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {formatMarketCap(stock.marketCap)}
          </div>
          <div className="text-xs text-slate-500 mt-1">発行済株式 × 終値</div>
        </div>

        {/* 4. 出来高 */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
            <span>出来高 (取引高)</span>
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {formatVolume(stock.volume)}
          </div>
          <div className="text-xs text-slate-500 mt-1">直近営業日の約定株数</div>
        </div>
      </div>

      {/* 配当権利確定月 & 配当金内訳 (中間・期末・年間) */}
      {stock.dividendSchedule && (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* 左: 権利確定月 & 頻度 */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <span>配当権利確定月</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {stock.dividendSchedule.frequency === 'annual'
                    ? '年1回 (期末)'
                    : stock.dividendSchedule.frequency === 'quarterly'
                    ? '四半期配当'
                    : '年2回配当'}
                </span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5 tracking-tight">
                {stock.dividendSchedule.recordMonthsLabel}
              </div>
            </div>
          </div>

          {/* 右: 中間・期末・年間の内訳チップ */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {stock.dividendSchedule.interimMonth && (
              <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-1.5">
                <span className="text-slate-400">中間 ({stock.dividendSchedule.interimMonth}月):</span>
                <span className="font-bold text-white font-mono">
                  {stock.dividendSchedule.interimDps !== null
                    ? `${stock.dividendSchedule.interimDps}円`
                    : '未定'}
                </span>
                {stock.dividendSchedule.interimDpsType && (
                  <span className="text-[10px] text-slate-500">
                    ({stock.dividendSchedule.interimDpsType === 'forecast' ? '予想' : '実績'})
                  </span>
                )}
              </div>
            )}

            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-1.5">
              <span className="text-slate-400">
                期末 ({stock.dividendSchedule.fiscalYearEndMonth}月):
              </span>
              <span className="font-bold text-white font-mono">
                {stock.dividendSchedule.yearEndDps !== null
                  ? `${stock.dividendSchedule.yearEndDps}円`
                  : '未定'}
              </span>
              {stock.dividendSchedule.yearEndDpsType && (
                <span className="text-[10px] text-slate-500">
                  ({stock.dividendSchedule.yearEndDpsType === 'forecast' ? '予想' : '実績'})
                </span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center gap-1.5">
              <span className="text-amber-400 font-medium">年間合計:</span>
              <span className="font-bold text-amber-300 font-mono text-sm">
                {stock.dividendSchedule.annualDps !== null
                  ? `${stock.dividendSchedule.annualDps}円`
                  : '-'}
              </span>
              {stock.dividendSchedule.annualDpsType && (
                <span className="text-[10px] text-amber-400/70">
                  ({stock.dividendSchedule.annualDpsType === 'forecast' ? '予想' : '実績'})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Secondary Valuation & Financial Metrics (PER, PBR, ROE, EPS, BPS) */}
      <div className="bg-slate-950/40 border border-slate-800/50 rounded-lg p-3.5">
        <div className="text-xs font-medium text-slate-400 mb-2.5 flex items-center gap-1.5">
          <PieChart className="w-3.5 h-3.5 text-slate-500" />
          <span>主要投資指標 (財務サマリー)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="text-xs font-semibold text-slate-300">PER (株価収益率)</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{formatRatio(stock.per)}</div>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="text-xs font-semibold text-slate-300">PBR (純資産倍率)</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{formatRatio(stock.pbr)}</div>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="text-xs font-semibold text-slate-300">ROE (自己資本利益率)</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{formatPercent(stock.roe)}</div>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="text-xs font-semibold text-slate-300">EPS (1株利益)</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{formatCurrency(stock.eps)}</div>
          </div>
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="text-xs font-semibold text-slate-300">BPS (1株純資産)</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{formatCurrency(stock.bps)}</div>
          </div>
        </div>
      </div>

      {/* 市場感応度・景気サイクル判定 (ベータ値: β) */}
      {betaAnalysis && cardTheme && (
        <div className={`border rounded-xl p-4 shadow-md transition ${cardTheme.border} ${cardTheme.bg}`}>
          {/* 上部ヘッダー: バッジ & タイトル */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xl">{betaAnalysis.badgeEmoji}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    市場感応度・景気サイクル判定: {betaAnalysis.label}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${cardTheme.badge}`}>
                    {betaAnalysis.category === 'defensive' && '守りの資産・下落耐性 🛡️'}
                    {betaAnalysis.category === 'neutral' && 'TOPIX市場連動 ⚖️'}
                    {betaAnalysis.category === 'cyclical' && '好況ブースト・高感応 🚀'}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              対TOPIX基準 (解析営業日: {betaAnalysis.dataDays}日)
            </div>
          </div>

          {/* メイン数値グリッド & 感応度メーター */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mt-3.5 items-center">
            {/* 1. 直近1年ベータ (メイン) */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-center gap-1">
                <span>ベータ値 (1年β)</span>
                <span className="text-[11px] text-slate-400">直近250日</span>
              </div>
              <div className={`text-2xl font-bold font-mono mt-0.5 ${cardTheme.text}`}>
                {betaAnalysis.beta1Year !== null ? betaAnalysis.beta1Year.toFixed(2) : '-'}
              </div>
              <div className="text-xs text-slate-300 mt-0.5 font-medium">
                {betaAnalysis.beta1Year !== null && (
                  betaAnalysis.beta1Year < 0.8
                    ? '市場の変動を大幅に抑制'
                    : betaAnalysis.beta1Year > 1.2
                    ? '市場の1.2倍以上乱高下'
                    : '市場平均と同等の値動き'
                )}
              </div>
            </div>

            {/* 2. 複数期間ベータ (3年・5年) */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-300 mb-1 text-center">中長期ベータ比較</div>
              <div className="flex items-center justify-around text-center pt-0.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">3年β</div>
                  <div className="text-sm font-bold text-slate-200 font-mono">
                    {betaAnalysis.beta3Year !== null ? betaAnalysis.beta3Year.toFixed(2) : '-'}
                  </div>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">5年β (全期間)</div>
                  <div className="text-sm font-bold text-slate-200 font-mono">
                    {betaAnalysis.beta5Year !== null ? betaAnalysis.beta5Year.toFixed(2) : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. TOPIX相関係数 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-slate-300">TOPIX相関係数 (r)</div>
              <div className="text-2xl font-bold text-white font-mono mt-0.5">
                {betaAnalysis.correlation !== null ? betaAnalysis.correlation.toFixed(2) : '-'}
              </div>
              <div className="text-xs text-slate-300 mt-0.5 font-medium">
                {betaAnalysis.correlation !== null && betaAnalysis.correlation >= 0.6
                  ? '市場と高い相関性'
                  : '個別固有の値動き傾向'}
              </div>
            </div>

            {/* 4. ビジュアル感応度メーター */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 flex flex-col justify-center">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span className="text-emerald-400 font-medium">ディフェンシブ (&lt;0.8)</span>
                <span className="text-indigo-300 font-medium">連動 (1.0)</span>
                <span className="text-amber-400 font-medium">景気敏感 (&gt;1.2)</span>
              </div>
              {/* スライダーゲージ */}
              <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500 opacity-70" />
                {/* マーカーピン */}
                {betaAnalysis.beta1Year !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-2.5 bg-white rounded-full shadow-md border border-slate-900 transform -translate-x-1/2"
                    style={{
                      left: `${Math.min(97, Math.max(3, (betaAnalysis.beta1Year / 2.0) * 100))}%`,
                    }}
                    title={`1年β: ${betaAnalysis.beta1Year}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                <span>0.0</span>
                <span>0.8</span>
                <span>1.0</span>
                <span>1.2</span>
                <span>2.0+</span>
              </div>
            </div>
          </div>

          {/* 解説文 */}
          <div className="mt-3 text-xs text-slate-300 bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/80 leading-relaxed">
            <span className="font-semibold text-slate-200">💡 判定解説と投資の視点: </span>
            {betaAnalysis.description}
          </div>
        </div>
      )}
    </div>
  );
};
