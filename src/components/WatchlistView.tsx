import React, { useState, useMemo } from 'react';
import type { WatchlistItem } from '../types/jquants';
import {
  formatCurrency,
  formatPercent,
  formatRatio,
  formatMarketCap,
  formatVolume,
  formatCashFlow,
} from '../utils/formatters';
import { useWatchlistFinancials } from '../hooks/useWatchlistFinancials';
import {
  Trash2,
  Plus,
  LineChart,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Layers,
  AlertCircle,
  ShieldCheck,
  TrendingUp,
  PieChart,
  Building2,
  RefreshCw,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  X,
  Cloud,
} from 'lucide-react';

interface WatchlistViewProps {
  items: WatchlistItem[];
  onRemoveItem: (code: string) => void;
  onAddItem: (code: string) => void;
  onClearAll: () => void;
  onSelectStockForChart: (code: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: number | null;
  onSyncWithServer?: () => void;
}

type TabType = 'basic' | 'sustainability' | 'returnPolicy' | 'fundamentals' | 'overview';

type WatchlistSortField =
  | 'code'
  | 'name'
  | 'currentPrice'
  | 'volume'
  | 'marketCap'
  | 'dividendYield'
  | 'dpsAnnual'
  | 'per'
  | 'pbr'
  | 'roe'
  // 持続力
  | 'latestCfo'
  | 'latestCfi'
  | 'latestFcf'
  | 'fcfPositiveCount'
  | 'nonReductionYears'
  | 'consecutiveDividendGrowthYears'
  | 'equityRatio'
  | 'equity5YearChangePercent'
  | 'beta1Year'
  // 還元方針
  | 'payoutRatio'
  | 'doe'
  // 事業基盤
  | 'opMargin'
  | 'roa'
  | 'eps5YearCagr'
  // 総合
  | 'scorePassed';

type WatchlistSortOrder = 'asc' | 'desc';

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  items,
  onRemoveItem,
  onAddItem,
  onClearAll,
  onSelectStockForChart,
  syncStatus = 'idle',
  lastSyncedAt = null,
  onSyncWithServer,
}) => {
  const [newCodeInput, setNewCodeInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [sortField, setSortField] = useState<WatchlistSortField>('marketCap');
  const [sortOrder, setSortOrder] = useState<WatchlistSortOrder>('desc');
  // 5期CF推移の展開状態 (銘柄コードセット)
  const [expandedCfCodes, setExpandedCfCodes] = useState<Set<string>>(new Set());
  const [isAllCfExpanded, setIsAllCfExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // 詳細財務指標の非同期取得・計算フック
  const { itemsWithFinancials, progress, refreshAll } = useWatchlistFinancials(items);

  // 銘柄追加ハンドラー
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCodeInput.trim();
    if (!clean) return;
    if (!/^\d{4}$/.test(clean)) {
      setInputError('4桁の銘柄コードを入力してください（例: 7203）');
      return;
    }
    setInputError(null);
    onAddItem(clean);
    setNewCodeInput('');
  };

  // ソート切替
  const handleSort = (field: WatchlistSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'code' || field === 'name' ? 'asc' : 'desc');
    }
  };

  // 5期CF推移の個別展開トグル
  const toggleExpandCf = (code: string) => {
    setExpandedCfCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  // 全銘柄一括展開トグル
  const handleToggleAllCf = () => {
    if (isAllCfExpanded) {
      setIsAllCfExpanded(false);
      setExpandedCfCodes(new Set());
    } else {
      setIsAllCfExpanded(true);
      setExpandedCfCodes(new Set(items.map((it) => it.code)));
    }
  };

  // ソート済みアイテム
  const sortedItems = useMemo(() => {
    const list = [...itemsWithFinancials];
    list.sort((a, b) => {
      let valA: any = (a as any)[sortField];
      let valB: any = (b as any)[sortField];

      // financials 内のフィールドをフォールバック
      if (valA === undefined && a.financials) {
        valA = (a.financials as any)[sortField];
      }
      if (valB === undefined && b.financials) {
        valB = (b.financials as any)[sortField];
      }

      if (sortField === 'per') {
        valA = a.fwdPer ?? a.per;
        valB = b.fwdPer ?? b.per;
      }

      if (sortField === 'beta1Year') {
        valA = a.betaAnalysis?.beta1Year;
        valB = b.betaAnalysis?.beta1Year;
      }

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [itemsWithFinancials, sortField, sortOrder]);

  const renderSortIcon = (field: WatchlistSortField) => {
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
      {/* 上部コントロールバー */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        {/* コード直接追加インプット */}
        <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              maxLength={4}
              placeholder="4桁コード (例: 7203)"
              value={newCodeInput}
              onChange={(e) => {
                setNewCodeInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              className="w-44 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>銘柄追加</span>
          </button>
          {inputError && <span className="text-xs text-rose-400">{inputError}</span>}
        </form>

        {/* アクションボタン群 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* サーバー同期ステータス & 手動再取得 */}
          {onSyncWithServer && (
            <button
              onClick={onSyncWithServer}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-sm transition disabled:opacity-50"
              title={
                syncStatus === 'syncing'
                  ? 'サーバーと同期中...'
                  : syncStatus === 'error'
                  ? '同期エラー (ローカルデータ使用中)。クリックで再試行'
                  : lastSyncedAt
                  ? `サーバー同期完了 (${new Date(lastSyncedAt).toLocaleTimeString()} 更新)。クリックで最新状態に再同期`
                  : 'サーバーの最新ウォッチリストを取得'
              }
            >
              <Cloud
                className={`w-3.5 h-3.5 ${
                  syncStatus === 'syncing'
                    ? 'animate-pulse text-indigo-400'
                    : syncStatus === 'error'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              />
              <span>
                {syncStatus === 'syncing'
                  ? '同期中...'
                  : syncStatus === 'error'
                  ? '同期再試行'
                  : 'サーバー同期済'}
              </span>
            </button>
          )}

          {/* 指標ガイド開閉ボタン */}
          <button
            onClick={() => setShowGuide((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${
              showGuide
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="主要財務指標の定義と投資判断の目安を表示"
          >
            <Lightbulb className={`w-3.5 h-3.5 ${showGuide ? 'text-amber-400' : 'text-amber-400'}`} />
            <span>指標の見方・目安</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {items.length > 0 && (
            <button
              onClick={() => refreshAll()}
              disabled={progress.isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition disabled:opacity-50"
              title="全銘柄の財務データを最新状態に再取得"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${progress.isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>財務更新</span>
            </button>
          )}

          {items.length > 0 && (
            <button
              onClick={() => {
                if (confirm('ウォッチリストの全銘柄を削除しますか？')) {
                  onClearAll();
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-900/60 transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>全件クリア</span>
            </button>
          )}
        </div>
      </div>

      {/* 💡 主要指標の見方・投資判断の目安ガイド (開閉アコーディオン) */}
      {showGuide && (
        <div className="bg-slate-900/95 border border-amber-500/30 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  主要財務指標の定義と投資判断の目安
                  <span className="text-[10px] font-normal text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded-full">
                    高配当・クオリティ投資基準
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  減配リスクを回避し、持続的な株主還元と事業基盤の成長力を両立できているかを多角的に評価・選別するための基準です。
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              title="ガイドを閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3大カテゴリのカードグリッド */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. 持続力 */}
            <div
              className={`p-4 rounded-xl border transition ${
                activeTab === 'sustainability'
                  ? 'bg-cyan-950/20 border-cyan-500/60 shadow-md shadow-cyan-950/30'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>1. 持続力 (Sustainability)</span>
                </div>
                {activeTab === 'sustainability' && (
                  <span className="text-[10px] text-cyan-300 bg-cyan-950/80 border border-cyan-800 px-1.5 py-0.2 rounded">選択中</span>
                )}
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-cyan-400">●</span> フリーCF (FCF)
                    <span className="text-[10px] text-slate-400 font-normal">＝ 営業CF ＋ 投資CF</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    事業で稼ぎ出した自由に使える現金の余力。直近数期で<strong className="text-emerald-400">恒常的にプラス（黒字）</strong>かが最重要。赤字が続く場合は借入金依存や将来の減配リスクが高まります。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-cyan-400">●</span> 営業CF / 投資CF
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    <strong>営業CF</strong>は本業の現金収入（<span className="text-emerald-400">プラス必須</span>）。<strong>投資CF</strong>は設備投資やM&A等の支出（通常は<span className="text-slate-300">マイナスが積極投資の証</span>）。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-cyan-400">●</span> 自己資本比率
                    <span className="text-[10px] text-slate-400 font-normal">＝ 自己資本 ÷ 総資産</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    返済義務のない資本の割合。<strong className="text-emerald-400">40%以上で健全</strong>。<strong className="text-cyan-300">60%超なら不況でも揺るがない強固な財務体質</strong>。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-cyan-400">●</span> 過去の配当履歴 (非減配年数)
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    過去5年間に減配がないか。<strong className="text-emerald-400">5期減配なし</strong>は、コロナ禍などの外部ショック時でも株主還元を維持できる耐久力の証明。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-cyan-400">●</span> ベータ値 (β) [対TOPIX感応度]
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    市場（TOPIX）の動きに対する感応度。<strong className="text-emerald-400">β &lt; 0.8: ディフェンシブ株🛡️</strong>（暴落に強い守り）、<strong className="text-indigo-300">0.8〜1.2: 市場連動⚖️</strong>、<strong className="text-amber-400">β &gt; 1.2: 景気敏感株🚀</strong>（好況時に高リターン、下落幅大）。
                  </p>
                </li>
              </ul>
            </div>

            {/* 2. 還元方針 */}
            <div
              className={`p-4 rounded-xl border transition ${
                activeTab === 'returnPolicy'
                  ? 'bg-amber-950/20 border-amber-500/60 shadow-md shadow-amber-950/30'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                  <PieChart className="w-4 h-4" />
                  <span>2. 還元方針 (Return Policy)</span>
                </div>
                {activeTab === 'returnPolicy' && (
                  <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-800 px-1.5 py-0.2 rounded">選択中</span>
                )}
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-amber-400">●</span> DOE (自己資本配当率)
                    <span className="text-[10px] text-slate-400 font-normal">＝ 配当総額 ÷ 自己資本</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    目安は<strong className="text-emerald-400">2.5%〜3.5%以上（★3.5%超は最優良）</strong>。純利益は景気で乱高下しますが、自己資本は急変しません。DOEを基準にする企業は<strong className="text-amber-300">業績が一時的に落ち込んでも減配しにくく、配当が極めて安定的</strong>になります。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-amber-400">●</span> 配当性向
                    <span className="text-[10px] text-slate-400 font-normal">＝ 配当金 ÷ 当期純利益</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    <strong className="text-emerald-400">30〜50%が最も健全</strong>（還元と再投資の好バランス）。50〜70%は適正〜積極還元。<strong className="text-amber-400">70〜80%超は警戒</strong>、<strong className="text-rose-400">100%超（タコ足配当）や赤字配当は減配予備軍（危険）</strong>。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-amber-400">●</span> 自社株買い
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    自己株式の取得により発行済株式数を減らし、1株利益（EPS）や1株純資産（BPS）を高める還元策。期末自己株数の推移から積極性を検知。
                  </p>
                </li>
              </ul>
            </div>

            {/* 3. 事業基盤 */}
            <div
              className={`p-4 rounded-xl border transition ${
                activeTab === 'fundamentals'
                  ? 'bg-purple-950/20 border-purple-500/60 shadow-md shadow-purple-950/30'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                  <Building2 className="w-4 h-4" />
                  <span>3. 事業基盤 (Fundamentals)</span>
                </div>
                {activeTab === 'fundamentals' && (
                  <span className="text-[10px] text-purple-300 bg-purple-950/80 border border-purple-800 px-1.5 py-0.2 rounded">選択中</span>
                )}
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-purple-400">●</span> 営業利益率
                    <span className="text-[10px] text-slate-400 font-normal">＝ 営業利益 ÷ 売上高</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    本業で稼ぐ力の強さ。<strong className="text-emerald-400">8%以上で優良</strong>、<strong className="text-purple-300">10%以上なら高収益（★）</strong>。価格決定力や他社が参入しにくい強み（参入障壁・堀）を持つ証。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-purple-400">●</span> ROE (自己資本利益率)
                    <span className="text-[10px] text-slate-400 font-normal">＝ 当期純利益 ÷ 自己資本</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    株主資本を元手にどれだけ効率的に利益を生み出したか。<strong className="text-emerald-400">8%以上が投資の合格ライン</strong>（東証・経産省の資本コスト経営基準）。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-purple-400">●</span> ROA (総資産利益率)
                    <span className="text-[10px] text-slate-400 font-normal">＝ 当期純利益 ÷ 総資産</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    借入を含む総資産全体の活用効率。<strong className="text-emerald-400">5%以上が目安</strong>。過度な借金（レバレッジ）でROEを不当に吊り上げていないかを見抜くために併用します。
                  </p>
                </li>
                <li>
                  <div className="font-semibold text-slate-200 flex items-center gap-1">
                    <span className="text-purple-400">●</span> EPS中長期成長性 (5年CAGR)
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    過去5年間の1株利益（EPS）の年平均成長率。<strong className="text-emerald-400">プラス成長基調</strong>であることこそが、中長期的な株価上昇と増配の源泉です。
                  </p>
                </li>
              </ul>
            </div>
          </div>

          {/* 下部フッター: 総合スコアと基本指標の要約 */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                <strong className="text-slate-200">総合ビューの判定スコア (10点満点)</strong>: 上記10項目（FCF恒常黒字、5期非減配、自己資本40%以上、配当性向健全、DOE2.5%以上、営業利益率8%以上、ROE8%以上、ROA5%以上、EPS成長、自社株買い）の合格数を合算したスコア（8点以上で優良）。
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span><strong>PER</strong>: 15倍基準 (割安/割高)</span>
              <span><strong>PBR</strong>: 1倍基準 (解散価値)</span>
            </div>
          </div>
        </div>
      )}

      {/* 財務データロード進捗バー (読込中の場合) */}
      {progress.isLoading && (
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between gap-4 text-xs animate-pulse">
          <div className="flex items-center gap-2 text-indigo-300">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>
              決算サマリーから財務指標（営業CF・投資CF・FCF・自己資本等）を解析中... (<strong>{progress.current}</strong> / {progress.total} 銘柄)
            </span>
          </div>
          <div className="w-40 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* カテゴリ別タブバー & 5期展開トグル */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'basic'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>基本・株価指標</span>
          </button>

          <button
            onClick={() => setActiveTab('sustainability')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'sustainability'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>1. 持続力 (営業CF / 投資CF / FCF / 自己資本)</span>
          </button>

          <button
            onClick={() => setActiveTab('returnPolicy')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'returnPolicy'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 text-amber-400" />
            <span>2. 還元方針 (配当性向 / DOE)</span>
          </button>

          <button
            onClick={() => setActiveTab('fundamentals')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'fundamentals'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. 事業基盤 (利益率 / ROE / ROA / EPS)</span>
          </button>

          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-yellow-300" />
            <span>総合ビュー (全指標＋スコア)</span>
          </button>
        </div>

        {/* 持続力タブ時の5期推移全開トグル & 件数情報 */}
        <div className="flex items-center gap-3">
          {activeTab === 'sustainability' && items.length > 0 && (
            <button
              onClick={handleToggleAllCf}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                isAllCfExpanded
                  ? 'bg-cyan-950/50 text-cyan-300 border-cyan-700/60'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              {isAllCfExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isAllCfExpanded ? '5期推移を全折りたたみ' : '5期推移を全展開して比較'}</span>
            </button>
          )}

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>登録: <strong className="text-white font-mono">{items.length}</strong> 銘柄</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">各列クリックでソート</span>
          </div>
        </div>
      </div>

      {/* 比較テーブル */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-200 font-semibold select-none">
                {/* 削除 */}
                <th className="py-3 px-3 w-10 text-center">操作</th>

                {/* 銘柄コード & 社名 */}
                <th
                  onClick={() => handleSort('code')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-200 transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>銘柄</span>
                    {renderSortIcon('code')}
                  </div>
                </th>

                {/* 業種 */}
                <th className="py-3 px-3 font-semibold">業種</th>

                {/* --- TAB 1: 基本・株価 --- */}
                {activeTab === 'basic' && (
                  <>
                    <th
                      onClick={() => handleSort('currentPrice')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>株価</span>
                        {renderSortIcon('currentPrice')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('volume')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>出来高</span>
                        {renderSortIcon('volume')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('marketCap')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>時価総額</span>
                        {renderSortIcon('marketCap')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('dividendYield')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-indigo-950/30 text-indigo-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>配当利回り</span>
                        {renderSortIcon('dividendYield')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('dpsAnnual')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>配当金</span>
                        {renderSortIcon('dpsAnnual')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('per')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>PER</span>
                        {renderSortIcon('per')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('pbr')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>PBR</span>
                        {renderSortIcon('pbr')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('roe')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>ROE</span>
                        {renderSortIcon('roe')}
                      </div>
                    </th>
                  </>
                )}

                {/* --- TAB 2: 持続力 (Sustainability) --- */}
                {activeTab === 'sustainability' && (
                  <>
                    <th
                      onClick={() => handleSort('latestCfo')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-emerald-950/20 text-emerald-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>直近 営業CF (本業)</span>
                        {renderSortIcon('latestCfo')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('latestCfi')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-cyan-950/20 text-cyan-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>直近 投資CF (投資)</span>
                        {renderSortIcon('latestCfi')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('latestFcf')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-indigo-950/30 text-indigo-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>直近 フリーCF (純現金)</span>
                        {renderSortIcon('latestFcf')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('fcfPositiveCount')}
                      className="py-3 px-3 font-semibold text-center cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>FCF恒常性</span>
                        {renderSortIcon('fcfPositiveCount')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('nonReductionYears')}
                      className="py-3 px-3 font-semibold text-center cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>非減配年数</span>
                        {renderSortIcon('nonReductionYears')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('equityRatio')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>自己資本比率</span>
                        {renderSortIcon('equityRatio')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('beta1Year')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                      title="1年ベータ値 (対TOPIX)。<0.8: ディフェンシブ🛡️, >1.2: 景気敏感🚀"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>感応度 (1年β)</span>
                        {renderSortIcon('beta1Year')}
                      </div>
                    </th>
                    {/* 5期縦並び推移トグル列 */}
                    <th className="py-3 px-3 font-semibold text-center w-28">
                      過去5期推移
                    </th>
                  </>
                )}

                {/* --- TAB 3: 還元方針 (Return Policy) --- */}
                {activeTab === 'returnPolicy' && (
                  <>
                    <th
                      onClick={() => handleSort('dividendYield')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-indigo-950/30 text-indigo-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>配当利回り</span>
                        {renderSortIcon('dividendYield')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('dpsAnnual')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>1株配当金</span>
                        {renderSortIcon('dpsAnnual')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('payoutRatio')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>配当性向 (健全:30-50%)</span>
                        {renderSortIcon('payoutRatio')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('doe')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-amber-950/20 text-amber-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>DOE (自己資本配当率)</span>
                        {renderSortIcon('doe')}
                      </div>
                    </th>
                    <th className="py-3 px-3 font-semibold text-center">
                      自社株買い検知
                    </th>
                  </>
                )}

                {/* --- TAB 4: 事業基盤 (Fundamentals) --- */}
                {activeTab === 'fundamentals' && (
                  <>
                    <th
                      onClick={() => handleSort('opMargin')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group bg-emerald-950/20 text-emerald-300"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>営業利益率 (目標8-10%+)</span>
                        {renderSortIcon('opMargin')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('roe')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>ROE (目標8%+)</span>
                        {renderSortIcon('roe')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('roa')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>ROA (目標5%+)</span>
                        {renderSortIcon('roa')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('eps5YearCagr')}
                      className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-slate-200 transition group"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>EPS中長期成長 (5年CAGR)</span>
                        {renderSortIcon('eps5YearCagr')}
                      </div>
                    </th>
                  </>
                )}

                {/* --- TAB 5: 総合ビュー (Overview) --- */}
                {activeTab === 'overview' && (
                  <>
                    <th
                      onClick={() => handleSort('scorePassed')}
                      className="py-3 px-3 font-semibold text-center cursor-pointer hover:text-slate-200 transition group bg-purple-950/30 text-purple-300"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-yellow-400" />
                        <span>適合スコア</span>
                        {renderSortIcon('scorePassed')}
                      </div>
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">配当利回り</th>
                    <th className="py-3 px-3 font-semibold text-right">直近営業CF</th>
                    <th className="py-3 px-3 font-semibold text-right">直近フリーCF</th>
                    <th className="py-3 px-3 font-semibold text-center">非減配/増配</th>
                    <th className="py-3 px-3 font-semibold text-right">自己資本比率</th>
                    <th className="py-3 px-3 font-semibold text-right">配当性向</th>
                    <th className="py-3 px-3 font-semibold text-right">DOE</th>
                    <th className="py-3 px-3 font-semibold text-right">営業利益率</th>
                    <th className="py-3 px-3 font-semibold text-right">ROE</th>
                    <th className="py-3 px-3 font-semibold text-right">ROA</th>
                  </>
                )}

                {/* チャート分析リンク */}
                <th className="py-3 px-3 text-center">チャート</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-3">
                      <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
                      <div className="text-slate-400 font-medium">ウォッチリストに銘柄が登録されていません</div>
                      <p className="text-xs text-slate-500">
                        「銘柄スクリーニング」画面から☆アイコンで追加するか、上部の入力欄に4桁のコードを入力して追加してください。
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => {
                  const fin = item.financials;
                  const isHighYield = item.dividendYield != null && item.dividendYield >= 3.5;
                  const isExpanded = isAllCfExpanded || expandedCfCodes.has(item.code);

                  return (
                    <React.Fragment key={item.code}>
                      <tr className="hover:bg-slate-800/50 transition group">
                        {/* 削除 */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => onRemoveItem(item.code)}
                            className="text-slate-600 hover:text-rose-400 p-1 rounded transition"
                            title="リストから削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* 銘柄コード & 社名 */}
                        <td className="py-2.5 px-3 font-medium">
                          <button
                            onClick={() => onSelectStockForChart(item.code)}
                            className="flex items-center gap-2 text-left group-hover:text-indigo-400 transition"
                            title="クリックしてチャート分析を開く"
                          >
                            <span className="font-mono font-bold text-white group-hover:text-indigo-300">
                              {item.code}
                            </span>
                            <span className="text-slate-100 font-medium truncate max-w-[130px] sm:max-w-[180px]">
                              {item.name}
                            </span>
                          </button>
                        </td>

                        {/* 業種 */}
                        <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap font-medium">{item.sector}</td>

                        {/* --- TAB 1: 基本・株価 --- */}
                        {activeTab === 'basic' && (
                          <>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-white">
                              {formatCurrency(item.currentPrice)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap font-medium">
                              {formatVolume(item.volume)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap font-medium">
                              {formatMarketCap(item.marketCap)}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-bold bg-indigo-950/20 ${
                                isHighYield ? 'text-amber-300' : 'text-slate-200'
                              }`}
                            >
                              {formatPercent(item.dividendYield)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {item.dpsAnnual != null ? `${item.dpsAnnual}円` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatRatio(item.fwdPer ?? item.per)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatRatio(item.pbr)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatPercent(item.roe)}
                            </td>
                          </>
                        )}

                        {/* --- TAB 2: 持続力 (Sustainability) --- */}
                        {activeTab === 'sustainability' && (
                          <>
                            {/* 直近 営業CF */}
                            <td className="py-2.5 px-3 text-right font-mono font-medium bg-emerald-950/10 whitespace-nowrap">
                              {fin?.latestCfo != null ? (
                                <span className={fin.latestCfo >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
                                  {formatCashFlow(fin.latestCfo)}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 直近 投資CF */}
                            <td className="py-2.5 px-3 text-right font-mono font-medium bg-cyan-950/10 whitespace-nowrap">
                              {fin?.latestCfi != null ? (
                                <span className="text-cyan-300">
                                  {formatCashFlow(fin.latestCfi)}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 直近 フリーCF */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold bg-indigo-950/20 whitespace-nowrap">
                              {fin?.latestFcf != null ? (
                                <span className={fin.latestFcf >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                                  {formatCashFlow(fin.latestFcf)}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* FCF恒常性 */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {fin ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                      fin.isFcfConsistentlyPositive
                                        ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    {fin.fcfPositiveCount}/{fin.fcfTotalCount}期プラス
                                  </span>
                                  {fin.isFcfConsistentlyPositive && (
                                    <span className="text-[10px] text-emerald-400" title="過半数が黒字かつ直近もプラス">
                                      🛡️ 安定
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 非減配年数 */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {fin ? (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                    fin.isNoDividendCut5Years
                                      ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-700/60'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {fin.isNoDividendCut5Years ? '5期減配なし' : `${fin.nonReductionYears}期非減配`}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 自己資本比率 */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {fin?.equityRatio != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-semibold ${
                                      fin.isEquityRatioSolid
                                        ? 'text-cyan-300'
                                        : fin.isEquityRatioSafe
                                        ? 'text-slate-200'
                                        : 'text-amber-400'
                                    }`}
                                  >
                                    {formatPercent(fin.equityRatio, 1)}
                                  </span>
                                  {fin.isEquityRatioSolid ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-900/60 text-cyan-200 border border-cyan-700/60">
                                      60%+強固
                                    </span>
                                  ) : fin.isEquityRatioSafe ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                      健全
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* ベータ値・市場感応度 */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {item.betaAnalysis?.beta1Year !== null && item.betaAnalysis?.beta1Year !== undefined ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
                                    item.betaAnalysis.category === 'defensive'
                                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                                      : item.betaAnalysis.category === 'cyclical'
                                      ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                                      : 'bg-indigo-950/40 text-indigo-300 border-indigo-800/60'
                                  }`}
                                  title={`${item.betaAnalysis.label} (1年β: ${item.betaAnalysis.beta1Year.toFixed(2)}, TOPIX相関: ${item.betaAnalysis.correlation ?? '-'})`}
                                >
                                  <span>{item.betaAnalysis.beta1Year.toFixed(2)}</span>
                                  <span>{item.betaAnalysis.badgeEmoji}</span>
                                </span>
                              ) : (
                                <span className="text-slate-600 font-mono">-</span>
                              )}
                            </td>

                            {/* 5期縦並び推移トグルボタン */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => toggleExpandCf(item.code)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition ${
                                  isExpanded
                                    ? 'bg-indigo-600 text-white border-indigo-500'
                                    : 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700'
                                }`}
                                title="過去5年間の営業CF・投資CF・フリーCFの推移を縦に一覧表示"
                              >
                                <span>5期内訳</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>
                          </>
                        )}

                        {/* --- TAB 3: 還元方針 (Return Policy) --- */}
                        {activeTab === 'returnPolicy' && (
                          <>
                            {/* 配当利回り */}
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-bold bg-indigo-950/20 ${
                                isHighYield ? 'text-amber-300' : 'text-slate-200'
                              }`}
                            >
                              {formatPercent(item.dividendYield)}
                            </td>

                            {/* 1株配当金 */}
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {item.dpsAnnual != null ? `${item.dpsAnnual}円` : '-'}
                            </td>

                            {/* 配当性向 */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {fin?.payoutRatio != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-semibold ${
                                      fin.payoutRatioStatus === 'healthy'
                                        ? 'text-emerald-300'
                                        : fin.payoutRatioStatus === 'acceptable'
                                        ? 'text-blue-300'
                                        : fin.payoutRatioStatus === 'warning'
                                        ? 'text-amber-400'
                                        : 'text-rose-400'
                                    }`}
                                  >
                                    {formatPercent(fin.payoutRatio, 1)}
                                  </span>
                                  {fin.payoutRatioStatus === 'healthy' && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                                      健全
                                    </span>
                                  )}
                                  {fin.payoutRatioStatus === 'warning' && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                      高水準
                                    </span>
                                  )}
                                  {fin.payoutRatioStatus === 'danger' && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60">
                                      危険
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* DOE */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap bg-amber-950/10">
                              {fin?.doe != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-bold ${
                                      fin.isDoeTopTier
                                        ? 'text-purple-300'
                                        : fin.isDoeHigh
                                        ? 'text-amber-300'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {formatPercent(fin.doe, 1)}
                                  </span>
                                  {fin.isDoeTopTier ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-purple-950/60 text-purple-200 border border-purple-800/60">
                                      ★3.5%+
                                    </span>
                                  ) : fin.isDoeHigh ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-200 border border-amber-800/60">
                                      安定
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 自社株買い検知 */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {fin?.buybackDetected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>実施実績あり</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* --- TAB 4: 事業基盤 (Fundamentals) --- */}
                        {activeTab === 'fundamentals' && (
                          <>
                            {/* 営業利益率 */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap bg-emerald-950/10">
                              {fin?.opMargin != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-bold ${
                                      fin.isOpMarginTopTier
                                        ? 'text-emerald-300'
                                        : fin.isOpMarginHigh
                                        ? 'text-teal-300'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {formatPercent(fin.opMargin, 1)}
                                  </span>
                                  {fin.isOpMarginTopTier ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/60">
                                      10%+高収益
                                    </span>
                                  ) : fin.isOpMarginHigh ? (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-teal-900/50 text-teal-200">
                                      8%+良好
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* ROE */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {fin?.roe != null || item.roe != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-medium ${
                                      (fin?.roe ?? item.roe!) >= 8.0 ? 'text-emerald-300' : 'text-slate-300'
                                    }`}
                                  >
                                    {formatPercent(fin?.roe ?? item.roe)}
                                  </span>
                                  {(fin?.roe ?? item.roe!) >= 8.0 && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-950/50 text-emerald-300">
                                      8%+合格
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* ROA */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {fin?.roa != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-medium ${
                                      fin.isRoaGood ? 'text-emerald-300' : 'text-slate-300'
                                    }`}
                                  >
                                    {formatPercent(fin.roa, 1)}
                                  </span>
                                  {fin.isRoaGood && (
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-950/50 text-emerald-300">
                                      5%+合格
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* EPS中長期成長性 */}
                            <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                              {fin?.eps5YearCagr != null ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`font-medium flex items-center gap-0.5 ${
                                      fin.eps5YearCagr > 0 ? 'text-emerald-300' : 'text-rose-400'
                                    }`}
                                  >
                                    <TrendingUp className={`w-3.5 h-3.5 ${fin.eps5YearCagr < 0 ? 'rotate-180' : ''}`} />
                                    <span>{formatPercent(fin.eps5YearCagr, 1)}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {fin.epsTrend === 'growing' ? '成長基調' : fin.epsTrend === 'stable' ? '横ばい' : '低下'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* --- TAB 5: 総合ビュー (Overview) --- */}
                        {activeTab === 'overview' && (
                          <>
                            {/* 適合スコア */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap bg-purple-950/20">
                              {fin ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    fin.scorePassed >= 7
                                      ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-600/60'
                                      : fin.scorePassed >= 5
                                      ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-600/60'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  <Award className="w-3 h-3 text-yellow-400" />
                                  <span>{fin.scorePassed} / {fin.scoreTotal}</span>
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 配当利回り */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                              {formatPercent(item.dividendYield)}
                            </td>

                            {/* 直近営業CF */}
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-400">
                              {fin?.latestCfo != null ? formatCashFlow(fin.latestCfo) : '-'}
                            </td>

                            {/* 直近フリーCF */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200">
                              {fin?.latestFcf != null ? (
                                <span className={fin.latestFcf >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                                  {formatCashFlow(fin.latestFcf)}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 非減配 */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {fin?.isNoDividendCut5Years ? (
                                <span className="text-indigo-300 font-semibold">5期減配ゼロ</span>
                              ) : fin ? (
                                <span className="text-slate-300">{fin.nonReductionYears}期非減配</span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* 自己資本比率 */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={fin?.isEquityRatioSolid ? 'text-cyan-300 font-bold' : fin?.isEquityRatioSafe ? 'text-slate-200' : 'text-amber-400'}>
                                {formatPercent(fin?.equityRatio, 1)}
                              </span>
                            </td>

                            {/* 配当性向 */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={fin?.payoutRatioStatus === 'healthy' ? 'text-emerald-300 font-bold' : fin?.payoutRatioStatus === 'danger' ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                                {formatPercent(fin?.payoutRatio, 1)}
                              </span>
                            </td>

                            {/* DOE */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={fin?.isDoeHigh ? 'text-amber-300 font-bold' : 'text-slate-300'}>
                                {formatPercent(fin?.doe, 1)}
                              </span>
                            </td>

                            {/* 営業利益率 */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={fin?.isOpMarginHigh ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                                {formatPercent(fin?.opMargin, 1)}
                              </span>
                            </td>

                            {/* ROE */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={(fin?.roe ?? item.roe ?? 0) >= 8.0 ? 'text-emerald-300' : 'text-slate-300'}>
                                {formatPercent(fin?.roe ?? item.roe)}
                              </span>
                            </td>

                            {/* ROA */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={fin?.isRoaGood ? 'text-emerald-300' : 'text-slate-300'}>
                                {formatPercent(fin?.roa, 1)}
                              </span>
                            </td>
                          </>
                        )}

                        {/* チャート分析ボタン */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => onSelectStockForChart(item.code)}
                            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition"
                            title="チャート分析を開く"
                          >
                            <LineChart className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* --- 過去5期キャッシュフロー縦並び内訳 (アコーディオン展開) --- */}
                      {activeTab === 'sustainability' && isExpanded && (
                        <tr className="bg-slate-950/70 border-b border-slate-800">
                          <td colSpan={11} className="py-3 px-6">
                            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3.5 shadow-lg max-w-3xl">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                                  <span className="font-semibold text-xs text-white">
                                    {item.name} ({item.code}) — 過去5期 キャッシュフロー推移
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400">
                                  ※ 営業CF (本業) ＋ 投資CF (設備等) ＝ フリーCF (純現金創出力)
                                </span>
                              </div>

                              {fin?.cfHistory && fin.cfHistory.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                      <tr className="text-slate-400 border-b border-slate-800 text-[11px] bg-slate-950/40">
                                        <th className="py-1.5 px-3 font-semibold">決算年度</th>
                                        <th className="py-1.5 px-3 text-right font-semibold text-emerald-300">
                                          営業活動CF (CFO)
                                        </th>
                                        <th className="py-1.5 px-3 text-right font-semibold text-cyan-300">
                                          投資活動CF (CFI)
                                        </th>
                                        <th className="py-1.5 px-3 text-right font-semibold text-indigo-300">
                                          フリーCF (FCF)
                                        </th>
                                        <th className="py-1.5 px-3 text-center font-semibold">
                                          キャッシュ創出タイプ
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                      {fin.cfHistory.map((cf) => {
                                        const isCfoPos = (cf.cfo ?? 0) > 0;
                                        const isCfiNeg = (cf.cfi ?? 0) < 0;
                                        const isFcfPos = (cf.fcf ?? 0) > 0;

                                        let typeLabel = '一般';
                                        let typeBadgeClass = 'bg-slate-800 text-slate-300';

                                        if (isCfoPos && isCfiNeg && isFcfPos) {
                                          typeLabel = '◎ 健全創出型';
                                          typeBadgeClass = 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60';
                                        } else if (isCfoPos && isCfiNeg && !isFcfPos) {
                                          typeLabel = '⚡ 積極投資型';
                                          typeBadgeClass = 'bg-blue-950/60 text-blue-300 border border-blue-700/60';
                                        } else if (!isCfoPos && isCfiNeg) {
                                          typeLabel = '⚠️ 先行投資/要警戒';
                                          typeBadgeClass = 'bg-amber-950/60 text-amber-300 border border-amber-700/60';
                                        } else if (isCfoPos && !isCfiNeg) {
                                          typeLabel = '資産売却型';
                                          typeBadgeClass = 'bg-purple-950/60 text-purple-300 border border-purple-700/60';
                                        }

                                        return (
                                          <tr key={cf.curPerEn} className="hover:bg-slate-800/40 transition">
                                            <td className="py-1.5 px-3 font-mono font-medium text-slate-200">
                                              {cf.periodLabel}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono font-medium text-emerald-400">
                                              {formatCashFlow(cf.cfo)}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono font-medium text-cyan-300">
                                              {formatCashFlow(cf.cfi)}
                                            </td>
                                            <td className={`py-1.5 px-3 text-right font-mono font-bold ${
                                              (cf.fcf ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-400'
                                            }`}>
                                              {formatCashFlow(cf.fcf)}
                                            </td>
                                            <td className="py-1.5 px-3 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${typeBadgeClass}`}>
                                                {typeLabel}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500 py-2 text-center">
                                  キャッシュフロー詳細データを取得中か、開示がありません
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
