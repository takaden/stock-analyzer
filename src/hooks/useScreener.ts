import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ScreenerStock, ScreenerFilters } from '../types/jquants';
import { DEFAULT_SCREENER_FILTERS } from '../types/jquants';
import { fetchAllScreenerBaseData } from '../services/jquantsApi';
import { cacheService } from '../services/cacheService';
import { extractLatestDps } from '../utils/indicators';
import { JPX400_UNIVERSE } from '../data/jpx400Data';

export type SortField =
  | 'code'
  | 'name'
  | 'currentPrice'
  | 'priceChangePercent'
  | 'dividendYield'
  | 'dpsAnnual'
  | 'marketCap'
  | 'tradingValue'
  | 'volume'
  | 'per'
  | 'pbr'
  | 'roe';

export type SortOrder = 'asc' | 'desc';

export const INITIAL_FILTERS: ScreenerFilters = DEFAULT_SCREENER_FILTERS;

export function useScreener() {
  const [allStocks, setAllStocks] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestDate, setLatestDate] = useState<string>('');
  const [filters, setFilters] = useState<ScreenerFilters>(INITIAL_FILTERS);
  const [sortField, setSortField] = useState<SortField>('dividendYield');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // データロード
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. まず Cloudflare D1 データベース (/api/screener-stocks) からの一括取得を試みる (全銘柄対応・0ms)
      try {
        const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');
        const res = await fetch(`${BASE_URL}/api/screener-stocks`);
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            const list: ScreenerStock[] = json.data.map((item: any) => {
              let dpsAnnual = item.dpsAnnual;
              let dividendYield = item.dividendYield;

              // ローカルキャッシュに個別詳細または財務開示がある場合は最新公式開示・新ロジックで動的補正
              const cachedFins = cacheService.getFinsSummary(item.code);
              const cachedStock = cacheService.getStock(item.code);
              if (cachedFins && cachedFins.length > 0) {
                const { dpsAnnual: extDps } = extractLatestDps(cachedFins);
                if (extDps != null) {
                  dpsAnnual = extDps;
                  dividendYield = item.currentPrice > 0 ? (dpsAnnual / item.currentPrice) * 100 : null;
                }
              } else if (cachedStock?.dpsAnnual != null) {
                dpsAnnual = cachedStock.dpsAnnual;
                dividendYield = cachedStock.dividendYield;
              }

              return {
                code: item.code,
                rawCode: item.rawCode,
                name: item.name,
                market: item.market,
                sector: item.sector,
                scaleCat: item.scaleCat,
                currentPrice: item.currentPrice,
                previousClose: item.previousClose,
                priceChange: item.priceChange,
                priceChangePercent: item.priceChangePercent,
                volume: item.volume,
                tradingValue:
                  item.tradingValue != null
                    ? item.tradingValue
                    : item.currentPrice && item.volume
                      ? item.currentPrice * item.volume
                      : 0,
                marketCap: item.marketCap,
                dpsAnnual,
                dividendYield,
                per: item.per,
                fwdPer: item.fwdPer,
                pbr: item.pbr,
                roe: item.roe,
                isJpx400: Boolean(item.isJpx400),
                isTopix100: Boolean(item.isTopix100),
                isPrime: Boolean(item.isPrime),
              };
            });
            setAllStocks(list);
            if (json.data[0]?.latestDate) {
              setLatestDate(json.data[0].latestDate);
            }
            setLoading(false);
            return;
          }
        }
      } catch (d1Err) {
        console.warn('D1 screener API unavailable, falling back to direct J-Quants fetch:', d1Err);
      }

      // 2. フォールバック: 日足・バリュエーションを最新営業日ベースで直接フェッチ
      const baseData = await fetchAllScreenerBaseData();
      setLatestDate(baseData.latestDate);

      // 前日終値マップ (Code -> Close)
      const prevCloseMap = new Map<string, number>();
      baseData.prevBars.forEach((b) => {
        prevCloseMap.set(b.Code, b.C);
      });

      // バリュエーションマップ (Code -> ValuationItem)
      const valMap = new Map<string, (typeof baseData.valuations)[0]>();
      baseData.valuations.forEach((v) => {
        valMap.set(v.Code, v);
      });

      // 最新日足マップ (Code -> DailyBar)
      const barMap = new Map<string, (typeof baseData.bars)[0]>();
      baseData.bars.forEach((b) => {
        barMap.set(b.Code, b);
      });

      // 銘柄マスターマップ (Code -> EquityMaster)
      const masterMap = new Map<string, (typeof baseData.masterList)[0]>();
      baseData.masterList.forEach((m) => {
        masterMap.set(m.Code, m);
      });

      // JPX400データセットを基本軸に、全日足銘柄を統合
      const stockList: ScreenerStock[] = [];

      // 1. まずJPX400の400銘柄を確実に生成
      JPX400_UNIVERSE.forEach((meta) => {
        const bar = barMap.get(meta.rawCode);
        const val = valMap.get(meta.rawCode);
        const master = masterMap.get(meta.rawCode);

        const currentPrice = bar?.C || 0;
        const prevClose = prevCloseMap.get(meta.rawCode) ?? null;
        const priceChange = prevClose && currentPrice ? currentPrice - prevClose : null;
        const priceChangePercent =
          prevClose && prevClose > 0 && priceChange != null ? (priceChange / prevClose) * 100 : null;

        // 配当金・利回り: キャッシュがあれば最新の公式開示を優先、なければマスターデータ
        const cachedFins = cacheService.getFinsSummary(meta.code);
        const cachedStock = cacheService.getStock(meta.code);
        let dpsAnnual = meta.dpsAnnual;
        if (cachedFins && cachedFins.length > 0) {
          const { dpsAnnual: extDps } = extractLatestDps(cachedFins);
          if (extDps != null) dpsAnnual = extDps;
        } else if (cachedStock?.dpsAnnual != null) {
          dpsAnnual = cachedStock.dpsAnnual;
        }
        const dividendYield =
          dpsAnnual != null && currentPrice > 0 ? (dpsAnnual / currentPrice) * 100 : null;

        stockList.push({
          code: meta.code,
          rawCode: meta.rawCode,
          name: master?.CoName || meta.name,
          market: master?.MktNm || meta.market,
          sector: master?.S33Nm || meta.sector,
          scaleCat: master?.ScaleCat || meta.scaleCat,
          currentPrice,
          previousClose: prevClose,
          priceChange,
          priceChangePercent,
          volume: bar?.Vo || 0,
          tradingValue: bar?.Va ?? ((bar?.C || 0) * (bar?.Vo || 0)),
          marketCap: bar?.MktCap ?? val?.MktCap ?? null,
          dpsAnnual,
          dividendYield,
          per: val?.PER ?? null,
          fwdPer: val?.FwdPER ?? null,
          pbr: val?.PBR ?? null,
          roe: val?.FwdROE != null ? val.FwdROE * 100 : val?.ROE != null ? val.ROE * 100 : null,
          isJpx400: true,
          isTopix100: meta.isTopix100,
          isPrime: meta.isPrime,
        });
      });

      // 2. 残りの上場銘柄もプライム市場・全銘柄ユニバース向けに追加
      const processedCodes = new Set(JPX400_UNIVERSE.map((u) => u.rawCode));
      baseData.bars.forEach((bar) => {
        if (processedCodes.has(bar.Code)) return; // 既に処理済み

        const master = masterMap.get(bar.Code);
        // 普通株 (ProdCat === '011') のみを対象（ETF・投資信託等は除外）
        if (master && master.MktNm === 'その他') return;

        const code4 = bar.Code.replace(/0$/, '');
        const val = valMap.get(bar.Code);
        const prevClose = prevCloseMap.get(bar.Code) ?? null;
        const priceChange = prevClose !== null ? bar.C - prevClose : null;
        const priceChangePercent =
          prevClose && prevClose > 0 && priceChange != null ? (priceChange / prevClose) * 100 : null;

        // 会社名・市場・業種をマスターから取得
        const name = master?.CoName || `銘柄: ${code4}`;
        const market = master?.MktNm || '東証';
        const sector = master?.S33Nm || '-';
        const scaleCat = master?.ScaleCat || '-';
        const isPrime = master?.MktNm === 'プライム';
        const isTopix100 = scaleCat === 'TOPIX Core30' || scaleCat === 'TOPIX Large70';

        // JPX400外の銘柄: キャッシュ(個別詳細または財務サマリー)がある場合は公式開示を使用
        const cachedFins = cacheService.getFinsSummary(code4);
        const cachedStock = cacheService.getStock(code4);
        let dpsAnnual: number | null = null;
        if (cachedFins && cachedFins.length > 0) {
          const { dpsAnnual: extDps } = extractLatestDps(cachedFins);
          if (extDps != null) dpsAnnual = extDps;
        } else if (cachedStock?.dpsAnnual != null) {
          dpsAnnual = cachedStock.dpsAnnual;
        }
        const dividendYield = dpsAnnual != null && bar.C > 0 ? (dpsAnnual / bar.C) * 100 : null;

        stockList.push({
          code: code4,
          rawCode: bar.Code,
          name,
          market,
          sector,
          scaleCat,
          currentPrice: bar.C,
          previousClose: prevClose,
          priceChange,
          priceChangePercent,
          volume: bar.Vo,
          tradingValue: bar.Va ?? (bar.C * bar.Vo),
          marketCap: bar.MktCap ?? val?.MktCap ?? null,
          dpsAnnual,
          dividendYield,
          per: val?.PER ?? null,
          fwdPer: val?.FwdPER ?? null,
          pbr: val?.PBR ?? null,
          roe: val?.FwdROE != null ? val.FwdROE * 100 : val?.ROE != null ? val.ROE * 100 : null,
          isJpx400: false,
          isTopix100,
          isPrime,
        });
      });

      setAllStocks(stockList);
    } catch (err: any) {
      console.error('Failed to load screener data:', err);
      setError(err.message || 'スクリーニングデータの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回自動ロード
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 利用可能なユニバース内全銘柄の業種一覧
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    allStocks.forEach((s) => {
      if (s.sector && s.sector !== '-') set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [allStocks]);

  // フィルタリング処理
  const filteredStocks = useMemo(() => {
    return allStocks.filter((stock) => {
      // 1. ユニバース判定
      if (filters.universe === 'jpx400' && !stock.isJpx400) return false;
      if (filters.universe === 'topix100' && !stock.isTopix100) return false;
      if (filters.universe === 'prime' && !stock.isPrime) return false;

      // 2. 配当利回り (X%以上)
      if (filters.minDividendYield != null) {
        if (stock.dividendYield == null || stock.dividendYield < filters.minDividendYield) {
          return false;
        }
      }

      // 3. PER (X倍以下) - 予想PERまたは実績PER
      if (filters.maxPer != null) {
        const targetPer = stock.fwdPer ?? stock.per;
        if (targetPer == null || targetPer <= 0 || targetPer > filters.maxPer) {
          return false;
        }
      }

      // 4. PBR (X倍以下)
      if (filters.maxPbr != null) {
        if (stock.pbr == null || stock.pbr <= 0 || stock.pbr > filters.maxPbr) {
          return false;
        }
      }

      // 5. 時価総額 (X億円以上)
      if (filters.minMarketCapOku != null) {
        const mktCapOku = stock.marketCap != null ? stock.marketCap / 100 : 0;
        if (mktCapOku < filters.minMarketCapOku) {
          return false;
        }
      }

      // 6. 売買代金 (X億円以上)
      if (filters.minTradingValueOku != null) {
        const thresholdYen = filters.minTradingValueOku * 100_000_000;
        if (stock.tradingValue < thresholdYen) {
          return false;
        }
      }

      // 7. 業種
      if (filters.sector !== 'all') {
        if (stock.sector !== filters.sector) {
          return false;
        }
      }

      // 8. 検索キーワード (コードまたは社名)
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.trim().toLowerCase();
        const codeMatch = stock.code.toLowerCase().includes(q);
        const nameMatch = stock.name.toLowerCase().includes(q);
        if (!codeMatch && !nameMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allStocks, filters]);

  // ソート処理
  const sortedStocks = useMemo(() => {
    const list = [...filteredStocks];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // PERの場合は予想PERを優先
      if (sortField === 'per') {
        valA = a.fwdPer ?? a.per;
        valB = b.fwdPer ?? b.per;
      }

      // null値のハンドリング (常に末尾へ)
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [filteredStocks, sortField, sortOrder]);

  // ソート切替
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // 数値系指標はデフォルト降順、コードや社名は昇順
      setSortOrder(field === 'code' || field === 'name' ? 'asc' : 'desc');
    }
  };

  // フィルター更新ヘルパー
  const updateFilter = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // フィルターリセット
  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  return {
    allStocks,
    filteredStocks: sortedStocks,
    totalCount: allStocks.length,
    matchedCount: sortedStocks.length,
    loading,
    error,
    latestDate,
    filters,
    sortField,
    sortOrder,
    availableSectors,
    updateFilter,
    resetFilters,
    handleSort,
    reload: loadData,
  };
}
