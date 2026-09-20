import type {
  EquityMaster,
  DailyBar,
  FinSummary,
  StockData,
  RateLimitState,
  ValuationItem,
  TopixBar,
} from '../types/jquants';
import { cacheService } from './cacheService';
import { parseNumber, extractDividendHistory, extractDividendSchedule, calculateBeta, extractLatestDps, extractAnnualEps, calculateRoeFromFins } from '../utils/indicators';

// code-serverのabsproxyパスやCloudflare Pagesに対応したプロキシベースURL
const BASE_PREFIX = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const BASE_URL = `${BASE_PREFIX}api/jq`;
const RATE_LIMIT_MAX = 60; // Lightプラン: 60回/分
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// リクエスト履歴 (ミリ秒タイムスタンプ配列)
let requestTimestamps: number[] = [];

// レートリミット状態変更リスナー
type RateLimitListener = (state: RateLimitState) => void;
const listeners: RateLimitListener[] = [];

export function subscribeRateLimit(listener: RateLimitListener): () => void {
  listeners.push(listener);
  notifyRateLimit();
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notifyRateLimit() {
  const state = getRateLimitState();
  listeners.forEach((fn) => fn(state));
}

export function getRateLimitState(): RateLimitState {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  const remaining = Math.max(0, RATE_LIMIT_MAX - requestTimestamps.length);
  const oldest = requestTimestamps[0];
  const nextReset = oldest ? Math.max(0, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000)) : 0;

  return {
    remainingThisMinute: remaining,
    maxPerMinute: RATE_LIMIT_MAX,
    nextResetSeconds: nextReset,
    isRateLimited: remaining <= 0,
  };
}

// 内部用共通Fetch処理
async function fetchWithKey<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const apiKey = cacheService.getApiKey();
  if (!apiKey) {
    throw new Error('J-Quants APIキーが設定されていません。ヘッダーの「設定」から入力してください。');
  }

  // レートリミットの事前チェック
  const state = getRateLimitState();
  if (state.isRateLimited) {
    throw new Error(
      `Lightプランのレートリミット（60回/分）に達しています。解除まで約 ${state.nextResetSeconds} 秒お待ちください。`
    );
  }

  const query = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${endpoint}${query ? `?${query}` : ''}`;

  // リクエスト時刻を記録
  requestTimestamps.push(Date.now());
  notifyRateLimit();

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  if (res.status === 429) {
    throw new Error('APIのレートリミット（429 Too Many Requests）を超過しました。1分程度待ってから再試行してください。');
  }

  if (res.status === 403) {
    throw new Error('403 Forbidden: APIキーが無効か、プランのアクセス権限がありません。APIキーを確認してください。');
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`APIエラー (${res.status}): ${errorText || res.statusText}`);
  }

  const json = await res.json();
  return json;
}

/**
 * 銘柄マスタ情報取得 (/v2/equities/master)
 */
export async function fetchMaster(code: string): Promise<EquityMaster | null> {
  const formattedCode = code.trim();
  const res = await fetchWithKey<{ data: EquityMaster[] }>('/equities/master', { code: formattedCode });
  const list = res.data || [];
  if (list.length === 0) return null;
  // 4桁指定なら普通株 (末尾0) を優先
  return list.find((m) => m.Code === `${formattedCode}0`) || list[0];
}

/**
 * 日足株価四本値取得 (/v2/equities/bars/daily)
 * Lightプランでは過去5年分の全データを自動ページネーションで取得
 */
export async function fetchDailyBars(code: string): Promise<DailyBar[]> {
  const formattedCode = code.trim();
  let allBars: DailyBar[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { code: formattedCode };
    if (paginationKey) {
      params.pagination_key = paginationKey;
    }
    const res = await fetchWithKey<{ data: DailyBar[]; pagination_key?: string }>('/equities/bars/daily', params);
    allBars = allBars.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  // 日付昇順にソート
  return allBars.sort((a, b) => a.Date.localeCompare(b.Date));
}

/**
 * 財務サマリー情報取得 (/v2/fins/summary)
 */
export async function fetchFinsSummary(code: string, forceRefresh: boolean = false): Promise<FinSummary[]> {
  const formattedCode = code.trim();
  if (!forceRefresh) {
    const cached = cacheService.getFinsSummary(formattedCode);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  let allFins: FinSummary[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { code: formattedCode };
    if (paginationKey) {
      params.pagination_key = paginationKey;
    }
    const res = await fetchWithKey<{ data: FinSummary[]; pagination_key?: string }>('/fins/summary', params);
    allFins = allFins.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  // 開示日降順にソート（最新が先頭）
  const sorted = allFins.sort((a, b) => b.DiscDate.localeCompare(a.DiscDate));
  if (sorted.length > 0) {
    cacheService.setFinsSummary(formattedCode, sorted);
  }
  return sorted;
}

/**
 * TOPIX 日足データの取得 (全期間、24時間ローカルキャッシュ)
 */
export async function fetchTopixDailyBars(forceRefresh: boolean = false): Promise<TopixBar[]> {
  if (!forceRefresh) {
    const cached = cacheService.getTopixBars();
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  try {
    const res = await fetchWithKey<{ data: TopixBar[] }>('/indices/bars/daily/topix', {});
    const bars = res.data || [];
    if (bars.length > 0) {
      cacheService.setTopixBars(bars);
    }
    return bars;
  } catch (err) {
    console.warn('Failed to fetch TOPIX bars:', err);
    return [];
  }
}

/**
 * 1銘柄の全データを取得して統合
 */
export async function fetchCompleteStockData(code: string, forceRefresh: boolean = false): Promise<StockData> {
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new Error('銘柄コードを入力してください。');
  }

  // 1. キャッシュ確認 (forceRefresh でない場合)
  if (!forceRefresh) {
    const cached = cacheService.getStock(cleanCode);
    if (
      cached &&
      Array.isArray(cached.historicalBars) &&
      cached.historicalBars.length > 0 &&
      ((Array.isArray(cached.dividendHistory) && cached.dividendHistory.length > 0) || cached.eps !== null || cached.dpsAnnual !== null)
    ) {
      if (cached.betaAnalysis) {
        return cached;
      }
      // キャッシュにベータ値がない場合はTOPIXキャッシュから補完
      const topix = cacheService.getTopixBars();
      if (topix && topix.length > 0) {
        cached.betaAnalysis = calculateBeta(cached.historicalBars, topix);
        cacheService.setStock(cleanCode, cached);
      }
      return cached;
    }
  }

  // 2. 並列で各APIから取得
  const [master, bars, fins, topixBars] = await Promise.all([
    fetchMaster(cleanCode).catch((err) => {
      console.warn('Master fetch failed:', err);
      return null;
    }),
    fetchDailyBars(cleanCode),
    fetchFinsSummary(cleanCode).catch((err) => {
      console.warn('Fins fetch failed:', err);
      return [];
    }),
    fetchTopixDailyBars(forceRefresh).catch((err) => {
      console.warn('TOPIX fetch failed:', err);
      return [];
    }),
  ]);

  if (!bars || bars.length === 0) {
    throw new Error(`銘柄コード「${cleanCode}」の株価データが見つかりませんでした。コードを確認してください。`);
  }

  const latestBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;

  const currentPrice = latestBar.C;
  const previousClose = prevBar ? prevBar.C : null;
  const priceChange = previousClose !== null ? currentPrice - previousClose : null;
  const priceChangePercent =
    previousClose !== null && previousClose > 0 ? (priceChange! / previousClose) * 100 : null;

  // 財務サマリーから配当・EPS・BPS等を取得
  let dpsAnnual: number | null = null;
  let dpsType: 'forecast' | 'actual' | null = null;
  let eps: number | null = null;
  let bps: number | null = null;
  let roe: number | null = null;

  if (fins && fins.length > 0) {
    const latestDps = extractLatestDps(fins);
    dpsAnnual = latestDps.dpsAnnual;
    dpsType = latestDps.dpsType;

    const latestEps = extractAnnualEps(fins);
    eps = latestEps.eps;

    roe = calculateRoeFromFins(fins);

    // BPS は開示日順に走査し、最新のBPSを取得（四半期開示で空欄の場合は直近本決算のBPSを採用）
    for (const fin of fins) {
      if (bps === null) {
        const val = parseNumber(fin.BPS);
        if (val !== null && val > 0) bps = val;
      }
      if (bps !== null) break;
    }
  }

  // 指標計算
  const dividendYield =
    dpsAnnual !== null && currentPrice > 0 ? (dpsAnnual / currentPrice) * 100 : null;
  const per = eps !== null && eps > 0 ? currentPrice / eps : null;
  const pbr = bps !== null && bps > 0 ? currentPrice / bps : null;

  // 過去の配当金推移と連続増配年数を抽出
  const { history: dividendHistory, streak: consecutiveDividendGrowthYears } = extractDividendHistory(fins);

  // 配当権利確定月および中間・期末の内訳スケジュールを抽出
  const dividendSchedule = extractDividendSchedule(fins);

  // ベータ値 (市場感応度: 景気敏感 / ディフェンシブ) の算出
  const betaAnalysis =
    topixBars && topixBars.length > 0 ? calculateBeta(bars, topixBars) : undefined;

  const stockData: StockData = {
    code: cleanCode,
    rawCode: master?.Code || latestBar.Code,
    name: master?.CoName || `銘柄コード: ${cleanCode}`,
    market: master?.MktNm || '東証',
    sector: master?.S33Nm || '-',
    latestDate: latestBar.Date,
    currentPrice,
    previousClose,
    priceChange,
    priceChangePercent,
    volume: latestBar.Vo,
    marketCap: latestBar.MktCap ?? null,
    dpsAnnual,
    dpsType,
    dividendYield,
    eps,
    bps,
    roe,
    per,
    pbr,
    historicalBars: bars,
    dividendHistory,
    consecutiveDividendGrowthYears,
    dividendSchedule,
    betaAnalysis,
    cachedAt: Date.now(),
  };

  // キャッシュに保存
  cacheService.setStock(cleanCode, stockData);

  return stockData;
}

/**
 * 日付指定による全上場銘柄の日足四本値取得 (/v2/equities/bars/daily?date=YYYY-MM-DD)
 */
export async function fetchDailyBarsByDate(date: string): Promise<DailyBar[]> {
  let allBars: DailyBar[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { date };
    if (paginationKey) {
      params.pagination_key = paginationKey;
    }
    const res = await fetchWithKey<{ data: DailyBar[]; pagination_key?: string }>('/equities/bars/daily', params);
    allBars = allBars.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allBars;
}

/**
 * 日付指定による全上場銘柄のバリュエーション指標取得 (/v2/equities/valuation?date=YYYY-MM-DD)
 */
export async function fetchValuationsByDate(date: string): Promise<ValuationItem[]> {
  let allVals: ValuationItem[] = [];
  let paginationKey: string | null = null;

  do {
    const params: Record<string, string> = { date };
    if (paginationKey) {
      params.pagination_key = paginationKey;
    }
    const res = await fetchWithKey<{ data: ValuationItem[]; pagination_key?: string }>('/equities/valuation', params);
    allVals = allVals.concat(res.data || []);
    paginationKey = res.pagination_key || null;
  } while (paginationKey);

  return allVals;
}

/**
 * 直近の最新営業日を取得（代表銘柄7203の最新バーから判定）
 */
export async function getLatestMarketDate(): Promise<{ latestDate: string; prevDate: string | null }> {
  // 代表銘柄（トヨタ 7203）の直近データを取得して日付を判定
  const bars = await fetchDailyBars('7203');
  if (!bars || bars.length === 0) {
    throw new Error('市場日付の取得に失敗しました。');
  }
  const latestDate = bars[bars.length - 1].Date;
  const prevDate = bars.length >= 2 ? bars[bars.length - 2].Date : null;
  return { latestDate, prevDate };
}

/**
 * 全上場銘柄のマスタ一覧取得 (/v2/equities/master)
 * キャッシュ(24h)を活用して無駄なAPI呼び出しを防止
 */
export async function fetchAllMaster(): Promise<EquityMaster[]> {
  const cached = cacheService.getMasterList();
  if (cached && cached.length > 0) {
    return cached;
  }

  const res = await fetchWithKey<{ data: EquityMaster[] }>('/equities/master', {});
  const list = res.data || [];
  if (list.length > 0) {
    cacheService.setMasterList(list);
  }
  return list;
}

/**
 * スクリーニングに必要な市場全データ（銘柄マスター、最新日足、前日終値用日足、バリュエーション指標）を一括取得
 */
export async function fetchAllScreenerBaseData(): Promise<{
  latestDate: string;
  prevDate: string | null;
  masterList: EquityMaster[];
  bars: DailyBar[];
  prevBars: DailyBar[];
  valuations: ValuationItem[];
}> {
  // 1. 最新営業日と前営業日を特定
  const { latestDate, prevDate } = await getLatestMarketDate();

  // 2. 銘柄マスター、最新日足、前日日足、最新バリュエーションを並行フェッチ
  const [masterList, bars, prevBars, valuations] = await Promise.all([
    fetchAllMaster(),
    fetchDailyBarsByDate(latestDate),
    prevDate ? fetchDailyBarsByDate(prevDate) : Promise.resolve([]),
    fetchValuationsByDate(latestDate),
  ]);

  return {
    latestDate,
    prevDate,
    masterList,
    bars,
    prevBars,
    valuations,
  };
}


