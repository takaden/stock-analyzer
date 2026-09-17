import { useState, useEffect, useCallback } from 'react';
import type { StockData, RateLimitState } from '../types/jquants';
import { fetchCompleteStockData, subscribeRateLimit, getRateLimitState } from '../services/jquantsApi';

export function useStockData(initialCode?: string) {
  const [stock, setStock] = useState<StockData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitState>(getRateLimitState());

  useEffect(() => {
    const unsubscribe = subscribeRateLimit((state) => {
      setRateLimit(state);
    });
    return () => unsubscribe();
  }, []);

  const searchStock = useCallback(async (code: string, forceRefresh: boolean = false) => {
    if (!code || !code.trim()) {
      setError('銘柄コードを入力してください。');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCompleteStockData(code, forceRefresh);
      setStock(data);
    } catch (err: any) {
      console.error('Error fetching stock:', err);
      setError(err.message || 'データ取得中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      searchStock(initialCode);
    }
  }, [initialCode, searchStock]);

  return {
    stock,
    loading,
    error,
    rateLimit,
    searchStock,
  };
}
