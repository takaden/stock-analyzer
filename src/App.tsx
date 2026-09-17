import { useState } from 'react';
import { useStockData } from './hooks/useStockData';
import { useScreener } from './hooks/useScreener';
import { useWatchlist } from './hooks/useWatchlist';
import { Header } from './components/Header';
import { NavigationTabs, type ActiveTab } from './components/NavigationTabs';
import { StockSearchForm } from './components/StockSearchForm';
import { StockSummaryCard } from './components/StockSummaryCard';
import { StockChart } from './components/StockChart';
import { StockDividendHistory } from './components/StockDividendHistory';
import { ScreenerView } from './components/ScreenerView';
import { WatchlistView } from './components/WatchlistView';
import { ApiKeyModal } from './components/ApiKeyModal';
import { cacheService } from './services/cacheService';
import { AlertCircle, RotateCw, Star, TrendingUp } from 'lucide-react';

export function App() {
  // ナビゲーションタブ状態 ('chart' | 'screener' | 'watchlist')
  const [activeTab, setActiveTab] = useState<ActiveTab>('screener');

  // チャート分析用フック（デフォルト: 未選択）
  const { stock, loading: chartLoading, error: chartError, rateLimit, searchStock } = useStockData();

  // スクリーニング用フック
  const screener = useScreener();

  // ウォッチリスト用フック
  const watchlist = useWatchlist(screener.allStocks);

  // 設定モーダル
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleApiKeyUpdated = () => {
    if (stock) {
      searchStock(stock.code, true);
    }
    screener.reload();
  };

  // 銘柄をチャートで表示するハンドラー
  const handleSelectStockForChart = (code: string) => {
    searchStock(code);
    setActiveTab('chart');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* 共通ヘッダー */}
      <Header rateLimit={rateLimit} onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-5 space-y-5">
        {/* ナビゲーションタブバー */}
        <NavigationTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          watchlistCount={watchlist.count}
        />

        {/* --- 1. 個別チャート分析タブ --- */}
        {activeTab === 'chart' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 銘柄コード検索バー */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <StockSearchForm
                  onSearch={searchStock}
                  loading={chartLoading}
                  currentCode={stock?.code}
                  watchlist={watchlist.watchlistItems}
                />
              </div>

              {/* ウォッチリスト追加/解除ボタン */}
              {stock && (
                <button
                  onClick={() => watchlist.toggleBookmark(stock.code)}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition shadow-sm ${
                    watchlist.isBookmarked(stock.code)
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                  title={watchlist.isBookmarked(stock.code) ? 'ウォッチリストから削除' : 'ウォッチリストに追加'}
                >
                  <Star
                    className={`w-4 h-4 ${watchlist.isBookmarked(stock.code) ? 'fill-current text-amber-400' : ''}`}
                  />
                  <span>
                    {watchlist.isBookmarked(stock.code) ? 'ウォッチリスト登録中' : 'ウォッチリストに追加'}
                  </span>
                </button>
              )}
            </div>

            {/* エラーアラート */}
            {chartError && (
              <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">データ取得エラー</div>
                  <p className="text-xs text-rose-300/90">{chartError}</p>
                </div>
              </div>
            )}

            {/* ローディング表示 */}
            {chartLoading && !stock && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-16 text-center space-y-3">
                <RotateCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                <div className="text-slate-300 font-medium">J-Quants APIより株価データを取得中...</div>
                <div className="text-xs text-slate-500">銘柄情報・日足四本値・財務サマリーを取得しています</div>
              </div>
            )}

            {/* 未選択時のガイダンス */}
            {!stock && !chartLoading && !chartError && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-3 max-w-xl mx-auto my-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">銘柄が選択されていません</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    上の検索窓に4桁の銘柄コードを入力して「データ取得」を押すか、<br />
                    ウォッチリストまたは「🔍 銘柄スクリーニング」から銘柄を選択してください。
                  </p>
                </div>
              </div>
            )}

            {/* 銘柄サマリーカード */}
            {stock && <StockSummaryCard stock={stock} />}

            {/* 日足ローソク足チャート */}
            {stock && stock.historicalBars.length > 0 && (
              <StockChart
                bars={stock.historicalBars}
                fins={cacheService.getFinsSummary(stock.code)}
                dividendHistory={stock.dividendHistory}
              />
            )}

            {/* 年間配当金推移・配当性向 */}
            {stock && stock.dividendHistory && stock.dividendHistory.length > 0 && (
              <StockDividendHistory
                history={stock.dividendHistory}
                consecutiveGrowthYears={stock.consecutiveDividendGrowthYears}
                currentYield={stock.dividendYield}
              />
            )}
          </div>
        )}

        {/* --- 2. 銘柄スクリーニングタブ --- */}
        {activeTab === 'screener' && (
          <ScreenerView
            stocks={screener.filteredStocks}
            totalCount={screener.totalCount}
            matchedCount={screener.matchedCount}
            loading={screener.loading}
            error={screener.error}
            latestDate={screener.latestDate}
            filters={screener.filters}
            sortField={screener.sortField}
            sortOrder={screener.sortOrder}
            availableSectors={screener.availableSectors}
            onUpdateFilter={screener.updateFilter}
            onResetFilters={screener.resetFilters}
            onSort={screener.handleSort}
            onSelectStockForChart={handleSelectStockForChart}
            isBookmarked={watchlist.isBookmarked}
            onToggleBookmark={watchlist.toggleBookmark}
            onAddMultipleToWatchlist={watchlist.addMultipleStocks}
          />
        )}

        {/* --- 3. ウォッチリスト比較タブ --- */}
        {activeTab === 'watchlist' && (
          <WatchlistView
            items={watchlist.watchlistItems}
            onRemoveItem={watchlist.removeStock}
            onAddItem={watchlist.addStock}
            onClearAll={watchlist.clearAll}
            onSelectStockForChart={handleSelectStockForChart}
            syncStatus={watchlist.syncStatus}
            lastSyncedAt={watchlist.lastSyncedAt}
            onSyncWithServer={watchlist.syncWithServer}
          />
        )}
      </main>

      {/* フッター */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-3 sm:px-5 lg:px-6 text-center text-xs text-slate-500">
        <div className="max-w-[1800px] mx-auto space-y-1.5">
          <p>
            データ提供: 株式会社日本取引所グループ (JPX) / J-Quants API (V2)
          </p>
          <p className="text-[11px] text-slate-600">
            ※ J-Quants API (V2) Lightプラン連携中（過去5年間データ・遅延なし）。本ツールの表示内容は投資勧誘を目的としたものではありません。
          </p>
        </div>
      </footer>

      {/* APIキー設定モーダル */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onApiKeyUpdated={handleApiKeyUpdated}
      />
    </div>
  );
}
export default App;

