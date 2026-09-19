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

// タブ切り替え等でコンポーネントが再マウントされても0msで即時復元できるよう、
// モジュールスコープに財務指標およびベータ値のキャッシュを保持
const globalFinancialsCache = new Map<string, WatchlistFinancials>();
const globalBetaCache = new Map<string, BetaAnalysis>();

export function useWatchlistFinancials(items: WatchlistItem[]) {
  // 初期レンダリング時からモジュールキャッシュおよび永続キャッシュを反映し、画面のチラつきを防止
  const [financialsMap, setFinancialsMap] = useState<Record<string, WatchlistFinancials | null>>(() => {
    const initial: Record<string, WatchlistFinancials | null> = {};
    for (const it of items) {
      if (globalFinancialsCache.has(it.code)) {
        initial[it.code] = globalFinancialsCache.get(it.code)!;
      } else {
        const cachedFins = cacheService.getFinsSummary(it.code);
        if (cachedFins && cachedFins.length > 0) {
          const fin = calculateWatchlistFinancials(cachedFins, it.currentPrice, it.dpsAnnual);
          if (fin) {
            globalFinancialsCache.set(it.code, fin);
            initial[it.code] = fin;
          }
        }
      }
    }
    return initial;
  });

  const [betaMap, setBetaMap] = useState<Record<string, BetaAnalysis | null>>(() => {
    const initial: Record<string, BetaAnalysis | null> = {};
    for (const it of items) {
      if (globalBetaCache.has(it.code)) {
        initial[it.code] = globalBetaCache.get(it.code)!;
      } else {
        const beta = cacheService.getBetaAnalysis(it.code) || cacheService.getStock(it.code)?.betaAnalysis;
        if (beta) {
          globalBetaCache.set(it.code, beta);
          initial[it.code] = beta;
        }
      }
    }
    return initial;
  });

  const [progress, setProgress] = useState<FinancialsProgress>({
    current: 0,
    total: 0,
    isLoading: false,
    error: null,
  });

  const isCancelledRef = useRef(false);
  const executionSeqRef = useRef(0);
  const itemsRef = useRef(items);
  const prevCodesRef = useRef<Set<string>>(new Set(items.map((it) => it.code)));
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const currentCodes = useMemo(() => new Set(items.map((it) => it.code)), [items]);
  const itemCodesKey = useMemo(() => items.map((it) => it.code).sort().join(','), [items]);

  const loadFinancials = useCallback(async (forceRefresh = false, targetCodes?: string[]) => {
    const currentSeq = ++executionSeqRef.current;
    const isCurrent = () => !isCancelledRef.current && executionSeqRef.current === currentSeq;

    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      if (isCurrent()) {
        setProgress({ current: 0, total: 0, isLoading: false, error: null });
      }
      return;
    }

    // 対象銘柄の絞り込み（指定があればその銘柄のみ、なければ全銘柄）
    const itemsToProcess = targetCodes
      ? currentItems.filter((it) => targetCodes.includes(it.code))
      : currentItems;

    if (itemsToProcess.length === 0) return;

    // 0. Cloudflare D1 から事前計算済み財務指標・ベータ値の一括取得を試みる (待ち時間 0ms)
    if (!forceRefresh) {
      try {
        const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');
        const codesStr = itemsToProcess.map((it) => it.code).join(',');
        const res = await fetch(`${BASE_URL}/api/watchlist-metrics?codes=${codesStr}`);
        if (res.ok) {
          const json = await res.json();
          if (!isCurrent()) return;
          if (json && json.data) {
            Object.entries(json.data).forEach(([code, data]: [string, any]) => {
              if (data) {
                // 既存の完全なキャッシュ（5期CF等）がある場合は上書きせずマージ
                const existing = globalFinancialsCache.get(code);
                if (existing && existing.cfHistory && existing.cfHistory.length >= 5) {
                  globalFinancialsCache.set(code, { ...data, ...existing });
                } else {
                  globalFinancialsCache.set(code, data);
                }

                if (data.betaAnalysis) {
                  globalBetaCache.set(code, data.betaAnalysis);
                  cacheService.setBetaAnalysis(code, data.betaAnalysis);
                }
              }
            });
          }
        }
      } catch (d1Err) {
        console.warn('D1 watchlist metrics API unavailable, falling back to local calculation:', d1Err);
      }
    }

    if (!isCurrent()) return;

    // 1. ローカルキャッシュおよびグローバルメモリにあるものを同期的に即座に反映
    let topixBars = cacheService.getTopixBars();
    const initialFinsMap: Record<string, WatchlistFinancials | null> = {};
    const initialBetaMap: Record<string, BetaAnalysis | null> = {};
    const uncachedItems: WatchlistItem[] = [];

    for (const item of itemsToProcess) {
      // (A) 財務指標の確認 (グローバルメモリ -> 財務サマリーキャッシュから計算)
      let fin = !forceRefresh ? (globalFinancialsCache.get(item.code) ?? null) : null;
      // D1データが5期未満の場合、ローカルキャッシュに過去開示があれば完全な5期推移を計算してマージ
      const cachedFins = !forceRefresh ? cacheService.getFinsSummary(item.code) : null;
      if (cachedFins && cachedFins.length > 0 && (!fin || !fin.cfHistory || fin.cfHistory.length < 5)) {
        const calculated = calculateWatchlistFinancials(cachedFins, item.currentPrice, item.dpsAnnual);
        if (calculated) {
          fin = fin ? { ...fin, ...calculated } : calculated;
          globalFinancialsCache.set(item.code, fin);
        }
      }

      // (B) ベータ値の確認 (グローバルメモリ -> ベータ専用キャッシュ -> 個別銘柄キャッシュ)
      let beta = !forceRefresh ? (globalBetaCache.get(item.code) ?? null) : null;
      if (!beta && !forceRefresh) {
        beta = cacheService.getBetaAnalysis(item.code);
        if (!beta) {
          const stockCached = cacheService.getStock(item.code);
          if (stockCached?.betaAnalysis) {
            beta = stockCached.betaAnalysis;
          } else if (stockCached?.historicalBars && topixBars && topixBars.length > 0) {
            const calculated = calculateBeta(stockCached.historicalBars, topixBars);
            if (calculated) {
              beta = calculated;
              stockCached.betaAnalysis = calculated;
              cacheService.setStock(item.code, stockCached);
            }
          }
        }
        if (beta) {
          globalBetaCache.set(item.code, beta);
          cacheService.setBetaAnalysis(item.code, beta);
        }
      }

      if (fin) initialFinsMap[item.code] = fin;
      if (beta) initialBetaMap[item.code] = beta;

      // 財務データがない、または5期CF履歴が不足している場合 (< 5期)、補完フェッチ対象とする
      const needsFullFins = !fin || !fin.cfHistory || fin.cfHistory.length < 5;
      const needsBeta = !beta;
      if (needsFullFins || needsBeta) {
        uncachedItems.push(item);
      }
    }

    if (!isCurrent()) return;

    setFinancialsMap((prev) => ({ ...prev, ...initialFinsMap }));
    setBetaMap((prev) => ({ ...prev, ...initialBetaMap }));

    // 全てキャッシュから即座に解決できた場合:
    // プログレスバーを一瞬たりとも表示させずに直ちに完了状態とする
    if (uncachedItems.length === 0) {
      if (isCurrent()) {
        setProgress({
          current: currentItems.length,
          total: currentItems.length,
          isLoading: false,
          error: null,
        });
      }
      return;
    }

    // 未キャッシュまたはデータ補完対象銘柄が存在する場合のみ、プログレスバーをアクティブにして非同期フェッチ開始
    let loadedCount = currentItems.length - uncachedItems.length;
    if (isCurrent()) {
      setProgress({
        current: loadedCount,
        total: currentItems.length,
        isLoading: true,
        error: null,
      });
    }

    // TOPIX 日足データの確保 (未キャッシュならAPIから取得)
    if (!topixBars || topixBars.length === 0) {
      try {
        topixBars = await fetchTopixDailyBars(forceRefresh);
      } catch (err) {
        console.warn('Failed to fetch TOPIX bars for watchlist:', err);
      }
    }

    if (!isCurrent()) return;

    // 2. 未完全・未キャッシュ銘柄を順次取得 (財務 ＋ 日足株価)
    for (const item of uncachedItems) {
      if (!isCurrent()) break;

      // レートリミット保護チェック: 残り枠がわずかな場合は安全待機
      const rateState = getRateLimitState();
      if (rateState.remainingThisMinute <= 3 && rateState.nextResetSeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(rateState.nextResetSeconds * 1000, 3000)));
        if (!isCurrent()) break;
      }

      // (A) 財務サマリーの取得 (未キャッシュまたは5期推移データ不足の場合に補完フェッチ)
      let fin = globalFinancialsCache.get(item.code) ?? null;
      const needsFullFins = !fin || !fin.cfHistory || fin.cfHistory.length < 5;
      if (needsFullFins || forceRefresh) {
        const cachedFins = !forceRefresh ? cacheService.getFinsSummary(item.code) : null;
        let fins = cachedFins && cachedFins.length >= 5 ? cachedFins : null;
        if (!fins) {
          try {
            fins = await fetchFinsSummary(item.code, forceRefresh);
          } catch (err: any) {
            console.warn(`Failed to fetch financials for ${item.code}:`, err);
          }
          if (!isCurrent()) break;
        }
        if (fins && fins.length > 0) {
          const calculatedFin = calculateWatchlistFinancials(fins, item.currentPrice, item.dpsAnnual);
          if (calculatedFin) {
            fin = fin ? { ...fin, ...calculatedFin } : calculatedFin;
            if (isCurrent()) {
              globalFinancialsCache.set(item.code, fin);
            }
          }
        }
        if (!isCurrent()) break;
        setFinancialsMap((prev) => ({ ...prev, [item.code]: fin }));
      }

      // (B) 日足データの取得 & ベータ値算出
      let beta = globalBetaCache.get(item.code) ?? cacheService.getBetaAnalysis(item.code);
      if (!beta || forceRefresh) {
        const stockCached = !forceRefresh ? cacheService.getStock(item.code) : null;
        let bars = stockCached?.historicalBars;
        if (!bars || bars.length === 0) {
          try {
            bars = await fetchDailyBars(item.code);
          } catch (err: any) {
            console.warn(`Failed to fetch daily bars for ${item.code}:`, err);
          }
          if (!isCurrent()) break;
        }

        if (bars && bars.length > 0 && topixBars && topixBars.length > 0) {
          const calculatedBeta = calculateBeta(bars, topixBars);
          if (calculatedBeta) {
            beta = calculatedBeta;
            if (isCurrent()) {
              globalBetaCache.set(item.code, calculatedBeta);
              cacheService.setBetaAnalysis(item.code, calculatedBeta);

              // 既存の完全なキャッシュが存在する場合のみ、日足とベータ値を更新して保存
              if (stockCached) {
                stockCached.historicalBars = bars;
                stockCached.betaAnalysis = calculatedBeta;
                cacheService.setStock(item.code, stockCached);
              }
            }
          }
        }
        if (!isCurrent()) break;
        setBetaMap((prev) => ({ ...prev, [item.code]: beta }));
      }

      // レートリミット保護ウェイト (Lightプラン: 60回/分)
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!isCurrent()) break;

      loadedCount++;
      setProgress((prev) => ({
        ...prev,
        current: loadedCount,
      }));
    }

    if (isCurrent()) {
      setProgress((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, []);

  // 銘柄コードリストの変更検知 & 差分更新 (Diffing)
  useEffect(() => {
    const prevCodes = prevCodesRef.current;
    const isInitial = isInitialMountRef.current;
    isInitialMountRef.current = false;

    // 新規に追加された銘柄コードを特定
    const addedCodes = Array.from(currentCodes).filter((code) => !prevCodes.has(code));
    prevCodesRef.current = currentCodes;

    // 銘柄削除のみの場合（新規追加されたコードが0件で初回マウントでない場合）:
    // 再フェッチ・再計算・プログレスリセットを完全にスキップ！
    if (!isInitial && addedCodes.length === 0) {
      // 削除された銘柄のキーをステートからクリーンアップ
      setFinancialsMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const code of Object.keys(next)) {
          if (!currentCodes.has(code)) {
            delete next[code];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setBetaMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const code of Object.keys(next)) {
          if (!currentCodes.has(code)) {
            delete next[code];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      return;
    }

    // 初回マウント時、または新規銘柄追加時のみ実行
    // 新規追加時はその銘柄のみを対象にし、既存銘柄の再処理を防止
    loadFinancials(false, !isInitial && addedCodes.length > 0 ? addedCodes : undefined);

    return () => {
      isCancelledRef.current = true;
    };
  }, [itemCodesKey, loadFinancials, currentCodes]);

  const itemsWithFinancials = useMemo<WatchlistItem[]>(() => {
    return items.map((it) => {
      const fin = financialsMap[it.code] ?? null;
      const beta = betaMap[it.code] ?? null;

      // 公式開示から抽出された配当金・配当利回りがあれば最優先で反映
      // 配当利回りは最新の it.currentPrice に追従させてリアルタイム計算
      const effectiveDps = fin?.dpsAnnual ?? it.dpsAnnual;
      const effectiveYield =
        effectiveDps !== null && it.currentPrice > 0
          ? Math.round((effectiveDps / it.currentPrice) * 10000) / 100
          : (fin?.dividendYield ?? it.dividendYield);

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
