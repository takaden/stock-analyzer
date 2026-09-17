import type { StockData, EquityMaster, FinSummary, TopixBar } from '../types/jquants';

const CACHE_PREFIX = 'jq_stock_v2_';
const FINS_PREFIX = 'jq_fins_v1_';
const API_KEY_STORAGE = 'jq_api_key';
const MASTER_STORAGE = 'jq_master_all';
const TOPIX_STORAGE = 'jq_topix_bars';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12時間有効
const FINS_TTL_MS = 24 * 60 * 60 * 1000; // 24時間有効
const MASTER_TTL_MS = 24 * 60 * 60 * 1000; // 24時間有効
const TOPIX_TTL_MS = 24 * 60 * 60 * 1000; // 24時間有効

// --- インメモリキャッシュ (Level 1: 0ms・JSONパースなし) ---
const memoryStockCache = new Map<string, CacheEntry<StockData>>();
const memoryFinsCache = new Map<string, CacheEntry<FinSummary[]>>();
let memoryMasterList: EquityMaster[] | null = null;
let memoryTopixBars: TopixBar[] | null = null;
let memoryWatchlist: string[] | null = null;

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');
const WATCHLIST_API_URL = `${BASE_URL}/api/watchlist`;
let serverSaveTimeout: ReturnType<typeof setTimeout> | null = null;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export const cacheService = {
  // API Key の取得（localStorageのみから取得。ビルド時のJSへのキー埋め込みを防止）
  getApiKey(): string {
    if (typeof localStorage === 'undefined') return '';
    const saved = localStorage.getItem(API_KEY_STORAGE);
    return saved && saved.trim() ? saved.trim() : '';
  },

  // API Key の保存
  setApiKey(key: string): void {
    if (typeof localStorage === 'undefined') return;
    if (!key.trim()) {
      localStorage.removeItem(API_KEY_STORAGE);
    } else {
      localStorage.setItem(API_KEY_STORAGE, key.trim());
    }
  },

  // 銘柄データのキャッシュ取得 (メモリ優先 -> localStorage)
  getStock(code: string): StockData | null {
    // 1. メモリキャッシュ確認 (O(1), JSONパースなし)
    const mem = memoryStockCache.get(code);
    if (mem) {
      if (Date.now() - mem.timestamp <= CACHE_TTL_MS) {
        return mem.data;
      }
      memoryStockCache.delete(code);
    }

    if (typeof localStorage === 'undefined') return null;

    // 2. localStorage から初回読み出し
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${code}`);
      if (!raw) return null;
      const entry: CacheEntry<StockData> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(`${CACHE_PREFIX}${code}`);
        return null;
      }
      // メモリにも保存して次回以降を爆速化
      memoryStockCache.set(code, entry);
      return entry.data;
    } catch (e) {
      console.error('Failed to read stock cache', e);
      return null;
    }
  },

  // 銘柄データの保存 (メモリ & localStorage)
  setStock(code: string, data: StockData): void {
    const entry: CacheEntry<StockData> = {
      data,
      timestamp: Date.now(),
    };
    memoryStockCache.set(code, entry);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${CACHE_PREFIX}${code}`, JSON.stringify(entry));
      } catch (e) {
        console.warn('Failed to save stock cache (storage may be full)', e);
      }
    }
  },

  // キャッシュの削除
  removeStock(code: string): void {
    memoryStockCache.delete(code);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${CACHE_PREFIX}${code}`);
    }
  },

  // 全銘柄キャッシュのクリア
  clearAllStockCache(): void {
    memoryStockCache.clear();
    memoryFinsCache.clear();
    memoryMasterList = null;
    memoryTopixBars = null;
    if (typeof localStorage === 'undefined') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(FINS_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  },

  // 財務サマリーのキャッシュ取得 (メモリ優先 -> localStorage)
  getFinsSummary(code: string): FinSummary[] | null {
    // 1. メモリキャッシュ確認
    const mem = memoryFinsCache.get(code);
    if (mem) {
      if (Date.now() - mem.timestamp <= FINS_TTL_MS) {
        return mem.data;
      }
      memoryFinsCache.delete(code);
    }

    if (typeof localStorage === 'undefined') return null;

    // 2. localStorage から初回読み出し
    try {
      const raw = localStorage.getItem(`${FINS_PREFIX}${code}`);
      if (!raw) return null;
      const entry: CacheEntry<FinSummary[]> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > FINS_TTL_MS) {
        localStorage.removeItem(`${FINS_PREFIX}${code}`);
        return null;
      }
      memoryFinsCache.set(code, entry);
      return entry.data;
    } catch (e) {
      console.error('Failed to read fins cache', e);
      return null;
    }
  },

  // 財務サマリーの保存 (メモリ & localStorage)
  setFinsSummary(code: string, data: FinSummary[]): void {
    const entry: CacheEntry<FinSummary[]> = {
      data,
      timestamp: Date.now(),
    };
    memoryFinsCache.set(code, entry);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${FINS_PREFIX}${code}`, JSON.stringify(entry));
      } catch (e) {
        console.warn('Failed to save fins cache (storage may be full)', e);
      }
    }
  },

  // --- サーバー共通ウォッチリスト（端末間共有）機能 ---
  async fetchServerWatchlist(): Promise<{ codes: string[]; success: boolean } | null> {
    try {
      const url = typeof window !== 'undefined'
        ? WATCHLIST_API_URL
        : 'http://localhost:5173' + WATCHLIST_API_URL;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json && json.success && Array.isArray(json.codes)) {
        const serverCodes = json.codes as string[];
        const localCodes = this.getWatchlist();

        // サーバーがまだ空で、ローカルに既存データがある場合は初期データ移行としてサーバーへアップロード
        if (serverCodes.length === 0 && localCodes.length > 0) {
          this.saveServerWatchlist(localCodes).catch(console.warn);
          return { codes: localCodes, success: true };
        }

        // サーバーから取得した最新値でローカルキャッシュを更新（サーバーが正）
        this.setWatchlist(serverCodes, false);
        return { codes: serverCodes, success: true };
      }
      return null;
    } catch (e) {
      console.warn('Failed to fetch watchlist from server, using local cache:', e);
      return null;
    }
  },

  async saveServerWatchlist(codes: string[]): Promise<boolean> {
    try {
      const url = typeof window !== 'undefined'
        ? WATCHLIST_API_URL
        : 'http://localhost:5173' + WATCHLIST_API_URL;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      return res.ok;
    } catch (e) {
      console.warn('Failed to save watchlist to server:', e);
      return false;
    }
  },

  getWatchlist(): string[] {
    if (memoryWatchlist !== null) {
      return [...memoryWatchlist];
    }
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('jq_watchlist_stocks');
      if (!raw) {
        memoryWatchlist = [];
        return [];
      }
      const list = JSON.parse(raw);
      const res = Array.isArray(list) ? list : [];
      memoryWatchlist = res;
      return [...res];
    } catch (e) {
      console.error('Failed to get watchlist', e);
      return [];
    }
  },

  setWatchlist(codes: string[], syncToServer = true): void {
    const unique = Array.from(new Set(codes.map((c) => c.trim()))).filter(Boolean);
    memoryWatchlist = unique;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('jq_watchlist_stocks', JSON.stringify(unique));
      } catch (e) {
        console.warn('Failed to save watchlist', e);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jq_watchlist_changed', { detail: unique }));
    }

    if (syncToServer && typeof window !== 'undefined') {
      if (serverSaveTimeout) clearTimeout(serverSaveTimeout);
      serverSaveTimeout = setTimeout(() => {
        this.saveServerWatchlist(unique).catch(console.warn);
      }, 300);
    }
  },

  addToWatchlist(codeOrCodes: string | string[]): string[] {
    const current = this.getWatchlist();
    const toAdd = Array.isArray(codeOrCodes) ? codeOrCodes : [codeOrCodes];
    const updated = Array.from(new Set([...current, ...toAdd.map((c) => c.trim())])).filter(Boolean);
    this.setWatchlist(updated, true);
    return updated;
  },

  removeFromWatchlist(code: string): string[] {
    const current = this.getWatchlist();
    const updated = current.filter((c) => c !== code.trim());
    this.setWatchlist(updated, true);
    return updated;
  },

  isWatchlisted(code: string): boolean {
    const current = this.getWatchlist();
    return current.includes(code.trim());
  },

  clearWatchlist(): void {
    this.setWatchlist([], true);
  },

  // --- 全銘柄マスターのキャッシュ管理 (メモリ優先 -> localStorage) ---
  getMasterList(): EquityMaster[] | null {
    if (memoryMasterList && memoryMasterList.length > 0) {
      return memoryMasterList;
    }
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(MASTER_STORAGE);
      if (!raw) return null;
      const entry: CacheEntry<EquityMaster[]> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > MASTER_TTL_MS) {
        localStorage.removeItem(MASTER_STORAGE);
        return null;
      }
      memoryMasterList = entry.data;
      return entry.data;
    } catch (e) {
      console.error('Failed to read master cache', e);
      return null;
    }
  },

  setMasterList(list: EquityMaster[]): void {
    // 必要なフィールドのみに軽量化してlocalStorage容量を節約
    const compactList: EquityMaster[] = list.map((m) => ({
      Date: m.Date,
      Code: m.Code,
      CoName: m.CoName,
      MktNm: m.MktNm,
      S33Nm: m.S33Nm,
      ScaleCat: m.ScaleCat,
    }));
    memoryMasterList = compactList;
    if (typeof localStorage !== 'undefined') {
      try {
        const entry: CacheEntry<EquityMaster[]> = {
          data: compactList,
          timestamp: Date.now(),
        };
        localStorage.setItem(MASTER_STORAGE, JSON.stringify(entry));
      } catch (e) {
        console.warn('Failed to save master cache (storage may be full)', e);
      }
    }
  },

  // TOPIX 日足データのキャッシュ取得 (メモリ -> localStorage)
  getTopixBars(): TopixBar[] | null {
    if (memoryTopixBars && memoryTopixBars.length > 0) {
      return memoryTopixBars;
    }
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(TOPIX_STORAGE);
      if (!raw) return null;
      const entry: CacheEntry<TopixBar[]> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > TOPIX_TTL_MS) {
        localStorage.removeItem(TOPIX_STORAGE);
        return null;
      }
      memoryTopixBars = entry.data;
      return entry.data;
    } catch (e) {
      console.error('Failed to read TOPIX cache', e);
      return null;
    }
  },

  // TOPIX 日足データの保存 (メモリ & localStorage)
  setTopixBars(bars: TopixBar[]): void {
    memoryTopixBars = bars;
    if (typeof localStorage !== 'undefined') {
      try {
        const entry: CacheEntry<TopixBar[]> = {
          data: bars,
          timestamp: Date.now(),
        };
        localStorage.setItem(TOPIX_STORAGE, JSON.stringify(entry));
      } catch (e) {
        console.warn('Failed to save TOPIX cache (storage may be full)', e);
      }
    }
  },
};
