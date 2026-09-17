import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { WatchlistItem, WatchlistFinancials, BetaAnalysis } from '../types/jquants';
import { fetchFinsSummary, fetchDailyBars, fetchTopixDailyBars, getRateLimitState } from '../services/jquantsApi';
import { cacheService } from '../services/cacheService';
import { calculateWatchlistFinancials, calculateBeta } from '../utils/indicators';

export interface FinancialsProgress {
  current: number;
  total: number;
  isLoading: boolean;
  error: string | null;
}

export function useWatchlistFinancials(items: WatchlistItem[]) {
  const [financialsMap, setFinancialsMap] = useState<Record<string, WatchlistFinancials | null>>({});
  const [betaMap, setBetaMap] = useState<Record<string, BetaAnalysis | null>>({});
  const [progress, setProgress] = useState<FinancialsProgress>({
    current: 0,
    total: 0,
    isLoading: false,
    error: null,
  });

  const isCancelledRef = useRef(false);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const itemCodesKey = useMemo(() => items.map((it) => it.code).sort().join(','), [items]);

  const loadFinancials = useCallback(async (forceRefresh = false) => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      setProgress({ current: 0, total: 0, isLoading: false, error: null });
      return;
    }

    isCancelledRef.current = false;
    setProgress({
      current: 0,
      total: currentItems.length,
      isLoading: true,
      error: null,
    });

    // 1. TOPIX 日足データの確保 (未キャッシュならAPIから取得)
    let topixBars = cacheService.getTopixBars();
    if (!topixBars || topixBars.length === 0) {
      try {
        topixBars = await fetchTopixDailyBars(forceRefresh);
      } catch (err) {
        console.warn('Failed to fetch TOPIX bars for watchlist:', err);
      }
    }

    let loadedCount = 0;

    // 2. ローカルキャッシュにあるものを同期的に即座に反映
    const initialFinsMap: Record<string, WatchlistFinancials | null> = {};
    const initialBetaMap: Record<string, BetaAnalysis | null> = {};
    const uncachedItems: WatchlistItem[] = [];

    for (const item of currentItems) {
      const cachedFins = !forceRefresh ? cacheService.getFinsSummary(item.code) : null;
      const stockCached = !forceRefresh ? cacheService.getStock(item.code) : null;

      let hasFins = false;
      let hasBeta = false;

      if (cachedFins && cachedFins.length > 0) {
        initialFinsMap[item.code] = calculateWatchlistFinancials(cachedFins, item.currentPrice, item.dpsAnnual);
        hasFins = true;
      }

      if (stockCached?.betaAnalysis) {
        initialBetaMap[item.code] = stockCached.betaAnalysis;
        hasBeta = true;
      } else if (stockCached?.historicalBars && topixBars && topixBars.length > 0) {
        const calculated = calculateBeta(stockCached.historicalBars, topixBars);
        if (calculated) {
          initialBetaMap[item.code] = calculated;
          stockCached.betaAnalysis = calculated;
          cacheService.setStock(item.code, stockCached);
          hasBeta = true;
        }
      }

      if (hasFins && hasBeta) {
        loadedCount++;
      } else {
        uncachedItems.push(item);
      }
    }

    setFinancialsMap((prev) => ({ ...prev, ...initialFinsMap }));
    setBetaMap((prev) => ({ ...prev, ...initialBetaMap }));
    setProgress({
      current: loadedCount,
      total: currentItems.length,
      isLoading: uncachedItems.length > 0,
      error: null,
    });

    if (uncachedItems.length === 0) {
      return;
    }

    // 3. 未キャッシュ銘柄を順次取得 (財務 ＋ 日足株価)
    for (const item of uncachedItems) {
      if (isCancelledRef.current) break;

      // レートリミット保護チェック: 残り枠がわずかな場合は安全待機
      const rateState = getRateLimitState();
      if (rateState.remainingThisMinute <= 3 && rateState.nextResetSeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(rateState.nextResetSeconds * 1000, 3000)));
      }

      // (A) 財務サマリーの取得
      const cachedFins = !forceRefresh ? cacheService.getFinsSummary(item.code) : null;
      if (!cachedFins || cachedFins.length === 0) {
        try {
          const fins = await fetchFinsSummary(item.code, forceRefresh);
          if (fins && fins.length > 0) {
            const calc = calculateWatchlistFinancials(fins, item.currentPrice, item.dpsAnnual);
            setFinancialsMap((prev) => ({ ...prev, [item.code]: calc }));
          } else {
            setFinancialsMap((prev) => ({ ...prev, [item.code]: null }));
          }
        } catch (err: any) {
          console.warn(`Failed to fetch financials for ${item.code}:`, err);
          setFinancialsMap((prev) => ({ ...prev, [item.code]: null }));
        }
      }

      // (B) 日足データの取得 & ベータ値算出
      const stockCached = !forceRefresh ? cacheService.getStock(item.code) : null;
      let beta = stockCached?.betaAnalysis ?? null;

      if (!beta) {
        let bars = stockCached?.historicalBars;
        if (!bars || bars.length === 0) {
          try {
            bars = await fetchDailyBars(item.code);
          } catch (err: any) {
            console.warn(`Failed to fetch daily bars for ${item.code}:`, err);
          }
        }

        if (bars && bars.length > 0 && topixBars && topixBars.length > 0) {
          const calculatedBeta = calculateBeta(bars, topixBars);
          if (calculatedBeta) {
            beta = calculatedBeta;
            setBetaMap((prev) => ({ ...prev, [item.code]: calculatedBeta }));

            // 既存の完全なキャッシュが存在する場合のみ、日足とベータ値を更新して保存
            // (不完全なStockDataを新規保存して個別チャート画面の配当履歴等を壊さないようにする)
            if (stockCached) {
              stockCached.historicalBars = bars;
              stockCached.betaAnalysis = calculatedBeta;
              cacheService.setStock(item.code, stockCached);
            }
          }
        }
      } else {
        setBetaMap((prev) => ({ ...prev, [item.code]: beta }));
      }

      // レートリミット保護ウェイト (Lightプラン: 60回/分)
      await new Promise((resolve) => setTimeout(resolve, 250));

      loadedCount++;
      setProgress((prev) => ({
        ...prev,
        current: loadedCount,
      }));
    }

    setProgress((prev) => ({
      ...prev,
      isLoading: false,
    }));
  }, []);

  useEffect(() => {
    loadFinancials(false);
    return () => {
      isCancelledRef.current = true;
    };
  }, [itemCodesKey, loadFinancials]);

  const itemsWithFinancials = useMemo<WatchlistItem[]>(() => {
    return items.map((it) => {
      const fin = financialsMap[it.code] ?? null;
      const beta = betaMap[it.code] ?? null;

      // 公式開示から抽出された配当金・配当利回りがあれば最優先で反映
      const effectiveDps = fin?.dpsAnnual ?? it.dpsAnnual;
      const effectiveYield = fin?.dividendYield ?? (
        effectiveDps !== null && it.currentPrice > 0 ? (effectiveDps / it.currentPrice) * 100 : it.dividendYield
      );

      return {
        ...it,
        dpsAnnual: effectiveDps,
        dividendYield: effectiveYield,
        financials: fin,
        betaAnalysis: beta,
      };
    });
  }, [items, financialsMap, betaMap]);

  return {
    itemsWithFinancials,
    progress,
    refreshAll: () => loadFinancials(true),
  };
}
