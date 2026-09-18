import fs from 'node:fs';

let envKey = process.env.VITE_JQUANTS_API_KEY || process.env.JQUANTS_API_KEY;
if (!envKey && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/VITE_JQUANTS_API_KEY=(.+)/) || envContent.match(/JQUANTS_API_KEY=(.+)/);
  if (match) envKey = match[1].trim();
}

const API_KEY = envKey || '';
const BASE_URL = 'https://api.jquants.com/v2';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestTime = 0;
// Lightプラン: 60回/分 = 最小1000ms間隔
const MIN_INTERVAL_MS = 1050;
let rateLimitQueue: Promise<void> = Promise.resolve();

function waitForRateLimitSlot(): Promise<void> {
  rateLimitQueue = rateLimitQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
      await sleep(MIN_INTERVAL_MS - elapsed);
    }
    lastRequestTime = Date.now();
  });
  return rateLimitQueue;
}

async function requestWithRateLimit<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!API_KEY) {
    throw new Error('API key not found. Please set VITE_JQUANTS_API_KEY or JQUANTS_API_KEY in .env');
  }

  await waitForRateLimitSlot();

  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });

  let retries = 3;
  while (retries > 0) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
      });

      if (res.status === 429) {
        console.warn('⚠️ Rate limit hit (429). Backing off for 10 seconds...');
        await sleep(10000);
        retries--;
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} from ${path}: ${text}`);
      }

      const json = await res.json();
      return json as T;
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.warn(`Request failed to ${path}, retrying in 3s...`, err);
      await sleep(3000);
    }
  }

  throw new Error(`Failed request to ${path} after retries.`);
}

export interface RawMaster {
  Date: string;
  Code: string;
  CoName: string;
  MktNm: string;
  S33Nm: string;
  ScaleCat: string;
  ProdCat: string;
}

export interface RawDailyBar {
  Date: string;
  Code: string;
  O: number;
  H: number;
  L: number;
  C: number;
  Vo: number;
  AdjC: number;
  MktCap?: number;
}

export interface RawValuation {
  Date: string;
  Code: string;
  PER?: number;
  FwdPER?: number;
  PBR?: number;
  ROE?: number;
  FwdROE?: number;
  MktCap?: number;
}

export interface RawFinSummary {
  DiscDate: string;
  DiscTime: string;
  Code: string;
  DiscNo: string;
  DocType: string;
  CurPerType: string;
  CurFYEn: string;
  CurPerEn: string;
  Sales?: string;
  OP?: string;
  OdP?: string;
  NP?: string;
  EPS?: string;
  FEPS?: string;
  BPS?: string;
  CFO?: string;
  CFI?: string;
  CFF?: string;
  TA?: string;
  Eq?: string;
  ShEq?: string;
  EqAR?: string;
  DivAnn?: string;
  FDivAnn?: string;
  Div2Q?: string;
  FDiv2Q?: string;
  DivFY?: string;
  FDivFY?: string;
  PayoutRatioAnn?: string;
  FPayoutRatioAnn?: string;
  ROE?: string;
  [key: string]: any;
}

/** 全銘柄マスター取得 */
export async function fetchAllMasters(): Promise<RawMaster[]> {
  console.log('📡 Fetching equities master...');
  const res = await requestWithRateLimit<{ data: RawMaster[] }>('/equities/master');
  return res.data || [];
}

/** 代表銘柄（トヨタ）の日足から最新営業日を取得 */
export async function fetchLatestTradingDate(): Promise<{ latestDate: string; prevDate: string }> {
  console.log('📡 Detecting latest trading dates from benchmark (7203)...');
  const res = await requestWithRateLimit<{ data: RawDailyBar[] }>('/equities/bars/daily', { code: '7203' });
  const bars = (res.data || []).sort((a, b) => a.Date.localeCompare(b.Date));
  if (bars.length < 2) {
    throw new Error(`Failed to resolve latest trading dates: insufficient benchmark daily bars (found ${bars.length}).`);
  }
  return {
    latestDate: bars[bars.length - 1].Date,
    prevDate: bars[bars.length - 2].Date,
  };
}

/** 指定日の全銘柄日足取得 (ページネーション対応) */
export async function fetchDailyBarsByDate(date: string): Promise<RawDailyBar[]> {
  console.log(`📡 Fetching daily bars for date ${date}...`);
  let allBars: RawDailyBar[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { date };
    if (paginationKey) params.pagination_key = paginationKey;
    const res = await requestWithRateLimit<{ data: RawDailyBar[]; pagination_key?: string }>('/equities/bars/daily', params);
    allBars = allBars.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allBars;
}

/** 指定日の全銘柄バリュエーション取得 (ページネーション対応) */
export async function fetchValuationsByDate(date: string): Promise<RawValuation[]> {
  console.log(`📡 Fetching valuations for date ${date}...`);
  let allVals: RawValuation[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { date };
    if (paginationKey) params.pagination_key = paginationKey;
    const res = await requestWithRateLimit<{ data: RawValuation[]; pagination_key?: string }>('/equities/valuation', params);
    allVals = allVals.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allVals;
}

/** 指定日の決算開示一覧取得 (日付指定一括取得) */
export async function fetchFinsByDate(date: string): Promise<RawFinSummary[]> {
  let allFins: RawFinSummary[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { date };
    if (paginationKey) params.pagination_key = paginationKey;
    try {
      const res = await requestWithRateLimit<{ data: RawFinSummary[]; pagination_key?: string }>('/fins/summary', params);
      allFins = allFins.concat(res.data || []);
      paginationKey = res.pagination_key || null;
    } catch (err: any) {
      // 404やデータなしの場合は空配列
      if (String(err).includes('404')) return [];
      throw err;
    }
  } while (paginationKey);

  return allFins;
}

/** 指定銘柄の全期間決算サマリー取得 */
export async function fetchFinsByCode(code: string): Promise<RawFinSummary[]> {
  let allFins: RawFinSummary[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { code: code.trim() };
    if (paginationKey) params.pagination_key = paginationKey;
    const res = await requestWithRateLimit<{ data: RawFinSummary[]; pagination_key?: string }>('/fins/summary', params);
    allFins = allFins.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allFins;
}

/** TOPIX ベンチマーク日足の取得 */
export async function fetchTopixBars(): Promise<{ Date: string; O: number; H: number; L: number; C: number }[]> {
  console.log('📡 Fetching TOPIX daily bars...');
  let allBars: any[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = {};
    if (paginationKey) params.pagination_key = paginationKey;
    const res = await requestWithRateLimit<{ data: any[]; pagination_key?: string }>('/indices/bars/daily/topix', params);
    allBars = allBars.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allBars.sort((a, b) => a.Date.localeCompare(b.Date));
}
