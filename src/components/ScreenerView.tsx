import React, { useState } from 'react';
import type { ScreenerStock, ScreenerFilters } from '../types/jquants';
import type { SortField, SortOrder } from '../hooks/useScreener';
import {
  formatCurrency,
  formatPercent,
  formatPriceChange,
  formatRatio,
  formatMarketCap,
  formatVolume,
  formatDate,
} from '../utils/formatters';
import {
  Search,
  RotateCcw,
  Star,
  CheckSquare,
  Square,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  BarChart3,
  X,
} from 'lucide-react';

interface ScreenerViewProps {
  stocks: ScreenerStock[];
  totalCount: number;
  matchedCount: number;
  loading: boolean;
  error: string | null;
  latestDate: string;
  filters: ScreenerFilters;
  sortField: SortField;
  sortOrder: SortOrder;
  availableSectors: string[];
  onUpdateFilter: <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => void;
  onResetFilters: () => void;
  onSort: (field: SortField) => void;
  onSelectStockForChart: (code: string) => void;
  isBookmarked: (code: string) => boolean;
  onToggleBookmark: (code: string) => void;
  onAddMultipleToWatchlist: (codes: string[]) => void;
}

export const ScreenerView: React.FC<ScreenerViewProps> = ({
  stocks,
  totalCount,
  matchedCount,
  loading,
  error,
  latestDate,
  filters,
  sortField,
  sortOrder,
  availableSectors,
  onUpdateFilter,
  onResetFilters,
  onSort,
  onSelectStockForChart,
  isBookmarked,
  onToggleBookmark,
  onAddMultipleToWatchlist,
}) => {
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);

  // チェックボックス処理
  const handleToggleSelect = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    if (selectedCodes.size === stocks.length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(stocks.map((s) => s.code)));
    }
  };

  const handleAddSelectedToWatchlist = () => {
    if (selectedCodes.size === 0) return;
    onAddMultipleToWatchlist(Array.from(selectedCodes));
    setSelectedCodes(new Set());
  };

  const handleAddAllFilteredToWatchlist = () => {
    if (stocks.length === 0) return;
    onAddMultipleToWatchlist(stocks.map((s) => s.code));
  };

  // ソートインジケーターアイコン
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* フィルターパネル */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {/* ユニバース選択 & 日付バッジ */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ユニバース:</span>
            <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => onUpdateFilter('universe', 'jpx400')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  filters.universe === 'jpx400'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                JPX日経400
              </button>
              <button
                onClick={() => onUpdateFilter('universe', 'topix100')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  filters.universe === 'topix100'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TOPIX 100 (大型)
              </button>
              <button
                onClick={() => onUpdateFilter('universe', 'prime')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  filters.universe === 'prime'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                プライム市場
              </button>
              <button
                onClick={() => onUpdateFilter('universe', 'all')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  filters.universe === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全銘柄
              </button>
            </div>
          </div>

          {latestDate && (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              データ基準日: <span className="font-medium text-slate-300">{formatDate(latestDate)}</span>
            </div>
          )}
        </div>

        {/* 主要フィルター: 配当利回り ＆ 出来高 ＆ 銘柄検索 (すべてAND条件) */}
        <div className="space-y-3.5">
          {/* 1行目: 配当利回り & 検索 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* 配当利回りクイック選択 */}
            <div className="md:col-span-8 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>配当利回り（以上）:</span>
                </label>
                {filters.minDividendYield != null && (
                  <span className="text-xs font-bold text-amber-400">
                    {filters.minDividendYield.toFixed(1)}% 以上
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: '指定なし', value: null },
                  { label: '2.5%+', value: 2.5 },
                  { label: '3.0%+', value: 3.0 },
                  { label: '3.5%+', value: 3.5 },
                  { label: '4.0%+', value: 4.0 },
                  { label: '5.0%+', value: 5.0 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => onUpdateFilter('minDividendYield', opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      filters.minDividendYield === opt.value
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    placeholder="自由入力"
                    value={filters.minDividendYield ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseFloat(e.target.value);
                      onUpdateFilter('minDividendYield', val);
                    }}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>

            {/* 銘柄検索 */}
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">銘柄名 / コード検索:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="7203 または トヨタ..."
                  value={filters.searchQuery}
                  onChange={(e) => onUpdateFilter('searchQuery', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* 2行目: 出来高クイック選択 (AND条件) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>出来高（以上・AND条件）:</span>
              </label>
              {filters.minVolume != null && (
                <span className="text-xs font-bold text-indigo-400">
                  {filters.minVolume >= 10000
                    ? `${(filters.minVolume / 10000).toLocaleString('ja-JP')}万株 以上`
                    : `${filters.minVolume.toLocaleString('ja-JP')}株 以上`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: '指定なし', value: null },
                { label: '10万株+', value: 100000 },
                { label: '30万株+', value: 300000 },
                { label: '50万株+', value: 500000 },
                { label: '100万株+', value: 1000000 },
                { label: '300万株+', value: 3000000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => onUpdateFilter('minVolume', opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filters.minVolume === opt.value
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/50 font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="number"
                  step="10"
                  min="0"
                  placeholder="例: 50"
                  value={filters.minVolume != null ? filters.minVolume / 10000 : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value) * 10000;
                    onUpdateFilter('minVolume', val);
                  }}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-slate-400">万株</span>
              </div>
            </div>
          </div>
        </div>

        {/* 詳細フィルター展開ボタン */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>詳細フィルター（PER / PBR / 時価総額 / 出来高 / 業種）</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>条件リセット</span>
          </button>
        </div>

        {/* 詳細フィルター領域 */}
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-800/60 text-xs">
            {/* PER */}
            <div className="space-y-1">
              <label className="text-slate-400">PER (倍以下):</label>
              <input
                type="number"
                step="1"
                placeholder="例: 15"
                value={filters.maxPer ?? ''}
                onChange={(e) =>
                  onUpdateFilter('maxPer', e.target.value === '' ? null : parseFloat(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* PBR */}
            <div className="space-y-1">
              <label className="text-slate-400">PBR (倍以下):</label>
              <input
                type="number"
                step="0.1"
                placeholder="例: 1.0 (解散割れ)"
                value={filters.maxPbr ?? ''}
                onChange={(e) =>
                  onUpdateFilter('maxPbr', e.target.value === '' ? null : parseFloat(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* 時価総額 */}
            <div className="space-y-1">
              <label className="text-slate-400">時価総額 (億円以上):</label>
              <input
                type="number"
                step="100"
                placeholder="例: 1000 (1000億円)"
                value={filters.minMarketCapOku ?? ''}
                onChange={(e) =>
                  onUpdateFilter('minMarketCapOku', e.target.value === '' ? null : parseFloat(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* 出来高 */}
            <div className="space-y-1">
              <label className="text-slate-400">出来高 (株以上):</label>
              <input
                type="number"
                step="10000"
                placeholder="例: 100000"
                value={filters.minVolume ?? ''}
                onChange={(e) =>
                  onUpdateFilter('minVolume', e.target.value === '' ? null : parseFloat(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* 33業種 */}
            <div className="space-y-1">
              <label className="text-slate-400">33業種:</label>
              <select
                value={filters.sector}
                onChange={(e) => onUpdateFilter('sector', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">全業種</option>
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* 適用中のAND条件バッジ一覧 */}
      {(filters.minDividendYield != null ||
        filters.minVolume != null ||
        filters.maxPer != null ||
        filters.maxPbr != null ||
        filters.minMarketCapOku != null ||
        filters.sector !== 'all' ||
        filters.searchQuery.trim()) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
          <span className="text-[11px] font-semibold text-slate-400">適用中のAND条件:</span>

          {filters.minDividendYield != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-950/60 text-amber-300 border border-amber-800/80">
              <span>利回り {filters.minDividendYield}%以上</span>
              <button
                onClick={() => onUpdateFilter('minDividendYield', null)}
                className="hover:text-white"
                title="条件を解除"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.minVolume != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-800/80">
              <span>
                出来高 {filters.minVolume >= 10000 ? `${filters.minVolume / 10000}万株` : `${filters.minVolume}株`}以上
              </span>
              <button
                onClick={() => onUpdateFilter('minVolume', null)}
                className="hover:text-white"
                title="条件を解除"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.maxPer != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
              <span>PER {filters.maxPer}倍以下</span>
              <button onClick={() => onUpdateFilter('maxPer', null)} className="hover:text-white" title="条件を解除">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.maxPbr != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
              <span>PBR {filters.maxPbr}倍以下</span>
              <button onClick={() => onUpdateFilter('maxPbr', null)} className="hover:text-white" title="条件を解除">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.minMarketCapOku != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
              <span>時価総額 {filters.minMarketCapOku}億円以上</span>
              <button
                onClick={() => onUpdateFilter('minMarketCapOku', null)}
                className="hover:text-white"
                title="条件を解除"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.sector !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
              <span>業種: {filters.sector}</span>
              <button onClick={() => onUpdateFilter('sector', 'all')} className="hover:text-white" title="条件を解除">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
              <span>検索: "{filters.searchQuery.trim()}"</span>
              <button onClick={() => onUpdateFilter('searchQuery', '')} className="hover:text-white" title="条件を解除">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={onResetFilters}
            className="text-[11px] text-slate-500 hover:text-slate-300 underline ml-1"
          >
            すべて解除
          </button>
        </div>
      )}

      {/* アクションバー & 件数 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">
            スクリーニング結果: <strong className="text-white text-base">{matchedCount}</strong> 件
            <span className="text-xs text-slate-500 ml-1">（母集団: {totalCount}件）</span>
          </span>

          {selectedCodes.size > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-medium">
              {selectedCodes.size} 件 選択中
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedCodes.size > 0 && (
            <button
              onClick={handleAddSelectedToWatchlist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>選択した {selectedCodes.size} 件をウォッチリストに追加</span>
            </button>
          )}

          {stocks.length > 0 && (
            <button
              onClick={handleAddAllFilteredToWatchlist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="現在のスクリーニング結果すべてをウォッチリストに追加"
            >
              <Star className="w-3.5 h-3.5" />
              <span>全件（{stocks.length}）を追加</span>
            </button>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-200 font-semibold select-none">
                {/* チェックボックス */}
                <th className="py-3 px-3 w-10 text-center">
                  <button
                    onClick={handleSelectAllOnPage}
                    className="text-slate-400 hover:text-white transition"
                    title={selectedCodes.size === stocks.length ? '全選択解除' : '全選択'}
                  >
                    {stocks.length > 0 && selectedCodes.size === stocks.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>

                {/* ブックマーク */}
                <th className="py-3 px-2 w-10 text-center">☆</th>

                {/* 銘柄コード & 社名 */}
                <th
                  onClick={() => onSort('code')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>銘柄</span>
                    {renderSortIcon('code')}
                  </div>
                </th>

                {/* 業種 */}
                <th className="py-3 px-3 font-semibold">業種</th>

                {/* 現在値 */}
                <th
                  onClick={() => onSort('currentPrice')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>株価</span>
                    {renderSortIcon('currentPrice')}
                  </div>
                </th>

                {/* 前日比 */}
                <th
                  onClick={() => onSort('priceChangePercent')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>前日比</span>
                    {renderSortIcon('priceChangePercent')}
                  </div>
                </th>

                {/* 配当利回り */}
                <th
                  onClick={() => onSort('dividendYield')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-indigo-950/30"
                >
                  <div className="flex items-center justify-end gap-1.5 text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>配当利回り</span>
                    {renderSortIcon('dividendYield')}
                  </div>
                </th>

                {/* 年間配当金 */}
                <th
                  onClick={() => onSort('dpsAnnual')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>配当金</span>
                    {renderSortIcon('dpsAnnual')}
                  </div>
                </th>

                {/* 時価総額 */}
                <th
                  onClick={() => onSort('marketCap')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>時価総額</span>
                    {renderSortIcon('marketCap')}
                  </div>
                </th>

                {/* 出来高 */}
                <th
                  onClick={() => onSort('volume')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>出来高</span>
                    {renderSortIcon('volume')}
                  </div>
                </th>

                {/* PER */}
                <th
                  onClick={() => onSort('per')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>PER</span>
                    {renderSortIcon('per')}
                  </div>
                </th>

                {/* PBR */}
                <th
                  onClick={() => onSort('pbr')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>PBR</span>
                    {renderSortIcon('pbr')}
                  </div>
                </th>

                {/* ROE */}
                <th
                  onClick={() => onSort('roe')}
                  className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>ROE</span>
                    {renderSortIcon('roe')}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {stocks.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500">
                    {loading
                      ? '市場データおよびスクリーニング結果を計算中...'
                      : '条件に一致する銘柄が見つかりませんでした。条件を緩和してください。'}
                  </td>
                </tr>
              ) : (
                stocks.map((stock) => {
                  const isSelected = selectedCodes.has(stock.code);
                  const isStarred = isBookmarked(stock.code);
                  const isHighYield = stock.dividendYield != null && stock.dividendYield >= 3.5;

                  return (
                    <tr
                      key={stock.code}
                      className={`hover:bg-slate-800/50 transition group ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* 選択チェック */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleToggleSelect(stock.code)}
                          className="text-slate-500 hover:text-white transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* ブックマーク ☆ */}
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => onToggleBookmark(stock.code)}
                          className={`p-1 rounded transition ${
                            isStarred
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title={isStarred ? 'ウォッチリストから解除' : 'ウォッチリストに追加'}
                        >
                          <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
                        </button>
                      </td>

                      {/* 銘柄コード & 社名 (クリックでチャートへジャンプ) */}
                      <td className="py-2.5 px-3 font-medium">
                        <button
                          onClick={() => onSelectStockForChart(stock.code)}
                          className="flex items-center gap-2 text-left group-hover:text-indigo-400 transition"
                          title="クリックしてチャート分析を開く"
                        >
                          <span className="font-mono font-bold text-white group-hover:text-indigo-300">
                            {stock.code}
                          </span>
                          <span className="text-slate-100 font-medium truncate max-w-[130px] sm:max-w-[180px]">
                            {stock.name}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      </td>

                      {/* 業種 */}
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap font-medium">{stock.sector}</td>

                      {/* 株価 */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-white">
                        {formatCurrency(stock.currentPrice)}
                      </td>

                      {/* 前日比 */}
                      <td
                        className={`py-2.5 px-3 text-right font-mono whitespace-nowrap font-semibold ${
                          stock.priceChange != null && stock.priceChange > 0
                            ? 'text-emerald-400'
                            : stock.priceChange != null && stock.priceChange < 0
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {formatPriceChange(stock.priceChange, stock.priceChangePercent)}
                      </td>

                      {/* 配当利回り */}
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold bg-indigo-950/20 ${
                          isHighYield ? 'text-amber-300' : 'text-slate-100'
                        }`}
                      >
                        {formatPercent(stock.dividendYield)}
                      </td>

                      {/* 年間配当金 */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium">
                        {stock.dpsAnnual != null ? `${stock.dpsAnnual}円` : '-'}
                      </td>

                      {/* 時価総額 */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium whitespace-nowrap">
                        {formatMarketCap(stock.marketCap)}
                      </td>

                      {/* 出来高 */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium whitespace-nowrap">
                        {formatVolume(stock.volume)}
                      </td>

                      {/* PER */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium">
                        {formatRatio(stock.fwdPer ?? stock.per)}
                      </td>

                      {/* PBR */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium">
                        {formatRatio(stock.pbr)}
                      </td>

                      {/* ROE */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium">
                        {formatPercent(stock.roe)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
