import { useState, useEffect, useMemo, useCallback } from 'react';
import type { WatchlistItem, ScreenerStock } from '../types/jquants';
import { cacheService } from '../services/cacheService';
import { extractLatestDps } from '../utils/indicators';
import { JPX400_CODE_MAP } from '../data/jpx400Data';

export function useWatchlist(allStocks: ScreenerStock[]) {
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>(() => cacheService.getWatchlist());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // サーバーからの最新ウォッチリスト取得
  const syncWithServer = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const res = await cacheService.fetchServerWatchlist();
      if (res && res.success) {
        setWatchlistCodes(res.codes);
        setSyncStatus('synced');
        setLastSyncedAt(Date.now());
      } else {
        setSyncStatus('idle');
      }
    } catch (e) {
      console.warn('Watchlist sync error:', e);
      setSyncStatus('error');
    }
  }, []);

  // 初回マウント時にサーバーと自動同期
  useEffect(() => {
    syncWithServer();
  }, [syncWithServer]);

  // ストレージ変更イベントリスナー（他画面・タブとの同期）
  useEffect(() => {
    const handleWatchlistChange = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setWatchlistCodes(e.detail);
      } else {
        setWatchlistCodes(cacheService.getWatchlist());
      }
    };

    window.addEventListener('jq_watchlist_changed', handleWatchlistChange);
    return () => {
      window.removeEventListener('jq_watchlist_changed', handleWatchlistChange);
    };
  }, []);

  // allStocksマップ (code -> ScreenerStock)
  const stockMap = useMemo(() => {
    const map = new Map<string, ScreenerStock>();
    allStocks.forEach((s) => map.set(s.code, s));
    return map;
  }, [allStocks]);

  // ウォッチリスト銘柄のアイテムリストを構築
  const watchlistItems = useMemo<WatchlistItem[]>(() => {
    return watchlistCodes
      .map((code) => {
        const live = stockMap.get(code);
        const meta = JPX400_CODE_MAP.get(code);

        // 基本データの決定 (live > JPX400 master > fallback)
        const base: ScreenerStock = live || (meta ? {
          code: meta.code,
          rawCode: meta.rawCode,
          name: meta.name,
          market: meta.market,
          sector: meta.sector,
          scaleCat: meta.scaleCat,
          currentPrice: 0,
          previousClose: null,
          priceChange: null,
          priceChangePercent: null,
          volume: 0,
          tradingValue: 0,
          marketCap: null,
          dpsAnnual: meta.dpsAnnual,
          dividendYield: null,
          per: null,
          fwdPer: null,
          pbr: null,
          roe: null,
          isJpx400: true,
          isTopix100: meta.isTopix100,
          isPrime: meta.isPrime,
        } : {
          code,
          rawCode: `${code}0`,
          name: `銘柄: ${code}`,
          market: '東証',
          sector: '-',
          scaleCat: '-',
          currentPrice: 0,
          previousClose: null,
          priceChange: null,
          priceChangePercent: null,
          volume: 0,
          tradingValue: 0,
          marketCap: null,
          dpsAnnual: null,
          dividendYield: null,
          per: null,
          fwdPer: null,
          pbr: null,
          roe: null,
          isJpx400: false,
          isTopix100: false,
          isPrime: true,
        });

        // キャッシュに個別詳細データまたは財務サマリーがある場合は公式開示で補正
        const cachedStock = cacheService.getStock(code);
        const cachedFins = cacheService.getFinsSummary(code);
        const currentPrice = base.currentPrice || cachedStock?.currentPrice || 0;
        let dpsAnnual = base.dpsAnnual;
        let dividendYield = base.dividendYield;

        if (cachedStock?.dpsAnnual != null) {
          dpsAnnual = cachedStock.dpsAnnual;
          dividendYield = cachedStock.dividendYield;
        } else if (cachedFins && cachedFins.length > 0) {
          const { dpsAnnual: extDps } = extractLatestDps(cachedFins);
          if (extDps != null) {
            dpsAnnual = extDps;
            dividendYield = currentPrice > 0 ? (dpsAnnual / currentPrice) * 100 : null;
          }
        }

        return {
          ...base,
          name: (base.name && !base.name.startsWith('銘柄:')) ? base.name : (cachedStock?.name || base.name),
          sector: (base.sector && base.sector !== '-') ? base.sector : (cachedStock?.sector || base.sector),
          market: (base.market && base.market !== '-') ? base.market : (cachedStock?.market || base.market),
          currentPrice,
          previousClose: base.previousClose ?? cachedStock?.previousClose ?? null,
          priceChange: base.priceChange ?? cachedStock?.priceChange ?? null,
          priceChangePercent: base.priceChangePercent ?? cachedStock?.priceChangePercent ?? null,
          volume: base.volume || cachedStock?.volume || 0,
          marketCap: base.marketCap ?? cachedStock?.marketCap ?? null,
          per: base.per ?? cachedStock?.per ?? null,
          pbr: base.pbr ?? cachedStock?.pbr ?? null,
          roe: base.roe ?? cachedStock?.roe ?? null,
          dpsAnnual,
          dividendYield,
          addedAt: 0,
        };
      })
      .filter(Boolean);
  }, [watchlistCodes, stockMap]);

  // アクション
  const addStock = useCallback((code: string) => {
    const updated = cacheService.addToWatchlist(code);
    setWatchlistCodes(updated);
  }, []);

  const addMultipleStocks = useCallback((codes: string[]) => {
    const updated = cacheService.addToWatchlist(codes);
    setWatchlistCodes(updated);
  }, []);

  const removeStock = useCallback((code: string) => {
    const updated = cacheService.removeFromWatchlist(code);
    setWatchlistCodes(updated);
  }, []);

  const toggleBookmark = useCallback((code: string) => {
    if (cacheService.isWatchlisted(code)) {
      const updated = cacheService.removeFromWatchlist(code);
      setWatchlistCodes(updated);
    } else {
      const updated = cacheService.addToWatchlist(code);
      setWatchlistCodes(updated);
    }
  }, []);

  const clearAll = useCallback(() => {
    cacheService.clearWatchlist();
    setWatchlistCodes([]);
  }, []);

  const isBookmarked = useCallback(
    (code: string) => watchlistCodes.includes(code.trim()),
    [watchlistCodes]
  );

  return {
    watchlistCodes,
    watchlistItems,
    count: watchlistCodes.length,
    addStock,
    addMultipleStocks,
    removeStock,
    toggleBookmark,
    clearAll,
    isBookmarked,
    syncStatus,
    lastSyncedAt,
    syncWithServer,
  };
}
