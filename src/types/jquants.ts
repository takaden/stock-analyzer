export interface EquityMaster {
  Date: string;
  Code: string;
  CoName: string;
  CoNameEn?: string;
  S17?: string;
  S17Nm?: string;
  S33?: string;
  S33Nm?: string;
  ScaleCat?: string;
  Mkt?: string;
  MktNm?: string;
}

export interface DailyBar {
  Date: string;
  Code: string;
  O: number;
  H: number;
  L: number;
  C: number;
  Vo: number;
  Va?: number;
  AdjFactor?: number;
  AdjO?: number;
  AdjH?: number;
  AdjL?: number;
  AdjC?: number;
  AdjVo?: number;
  MktCap?: number; // 百万円
  ExRT?: string | null;
}

export interface TopixBar {
  Date: string;
  O: number;
  H: number;
  L: number;
  C: number;
}

export type MarketSensitivityCategory = 'defensive' | 'neutral' | 'cyclical';

export interface BetaAnalysis {
  beta1Year: number | null; // 直近1年間 (約250営業日)
  beta3Year: number | null; // 直近3年間 (約750営業日)
  beta5Year: number | null; // 過去5年間 (全期間)
  correlation: number | null; // TOPIXとの相関係数 (1年)
  category: MarketSensitivityCategory; // 'defensive' | 'neutral' | 'cyclical'
  label: string; // 'ディフェンシブ' | '市場連動' | '景気敏感'
  badgeEmoji: string; // '🛡️' | '⚖️' | '🚀'
  description: string; // 詳細解説文
  dataDays: number; // 計算に使用した営業日数
}

export interface FinSummary {
  DiscDate: string;
  DiscTime?: string;
  Code: string;
  DiscNo?: string;
  DocType?: string;
  CurPerType?: string;
  CurPerSt?: string;
  CurPerEn?: string;
  CurFYSt?: string;
  CurFYEn?: string;
  NxtFYSt?: string;
  NxtFYEn?: string;
  Sales?: string | number;
  OP?: string | number;
  OdP?: string | number;
  NP?: string | number;
  EPS?: string | number;
  FEPS?: string | number;
  DEPS?: string | number;
  TA?: string | number;
  Eq?: string | number;
  EqAR?: string | number;
  BPS?: string | number;
  Div1Q?: string | number;
  Div2Q?: string | number;
  Div3Q?: string | number;
  DivFY?: string | number;
  DivAnn?: string | number;
  DivTotalAnn?: string | number;
  FDiv1Q?: string | number;
  FDiv2Q?: string | number;
  FDiv3Q?: string | number;
  FDivFY?: string | number;
  FDivAnn?: string | number;
  FDivTotalAnn?: string | number;
  PayoutRatioAnn?: string | number;
  FPayoutRatioAnn?: string | number;
  NxFDiv1Q?: string | number;
  NxFDiv2Q?: string | number;
  NxFDiv3Q?: string | number;
  NxFDivFY?: string | number;
  NxFDivAnn?: string | number;
  NxFEPS?: string | number;
  NxFPayoutRatioAnn?: string | number;
  ROE?: string | number;
  ShEq?: string | number;
  CFO?: string | number;
  CFI?: string | number;
  CFF?: string | number;
  CashEq?: string | number;
  TrShFY?: string | number;
  ShOutFY?: string | number;
  FSales?: string | number;
  FOP?: string | number;
  FOdP?: string | number;
  FNP?: string | number;
}

export interface DividendHistoryItem {
  periodLabel: string; // 例: "2024/03期", "2025/03期", "2026/03期", "2027/03期(予)"
  discDate: string;
  dps: number; // 年間配当金 (円)
  payoutRatio: number | null; // 配当性向 (%)
  eps: number | null; // 1株利益 (円)
  isForecast: boolean; // 予想値フラグ
  changeAmount: number | null; // 前年比増減額 (円)
  changePercent: number | null; // 前年比増減率 (%)
}

export interface DividendSchedule {
  fiscalYearEndMonth: number; // 決算月 (期末配当確定月: 例 3)
  interimMonth: number | null; // 中間配当確定月 (例 9)
  recordMonthsLabel: string; // 例: "3月末 / 9月末", "12月末 / 6月末", "3月末 (年1回)"
  frequency: 'twice' | 'annual' | 'quarterly' | 'other';
  // 直近・今期の配当内訳
  interimDps: number | null; // 中間配当金 (円)
  interimDpsType: 'forecast' | 'actual' | null;
  yearEndDps: number | null; // 期末配当金 (円)
  yearEndDpsType: 'forecast' | 'actual' | null;
  annualDps: number | null; // 年間合計配当金 (円)
  annualDpsType: 'forecast' | 'actual' | null;
  // 前期実績の内訳（比較用）
  prevInterimDps?: number | null;
  prevYearEndDps?: number | null;
  prevAnnualDps?: number | null;
}

export interface StockData {
  code: string;
  rawCode: string;
  name: string;
  market: string;
  sector: string;
  latestDate: string;
  currentPrice: number;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  volume: number;
  marketCap: number | null; // 百万円
  dpsAnnual: number | null; // 1株当たり年間配当金 (円)
  dpsType: 'forecast' | 'actual' | null;
  dividendYield: number | null; // %
  eps: number | null;
  bps: number | null;
  roe: number | null; // %
  per: number | null;
  pbr: number | null;
  historicalBars: DailyBar[];
  dividendHistory: DividendHistoryItem[];
  consecutiveDividendGrowthYears: number;
  dividendSchedule?: DividendSchedule;
  betaAnalysis?: BetaAnalysis;
  cachedAt: number;
}

export interface RateLimitState {
  remainingThisMinute: number;
  maxPerMinute: number;
  nextResetSeconds: number;
  isRateLimited: boolean;
}

export interface ValuationItem {
  Date: string;
  Code: string;
  EPS: number | null;
  FwdEPS: number | null;
  BPS: number | null;
  ROE: number | null;
  FwdROE: number | null;
  PER: number | null;
  FwdPER: number | null;
  PBR: number | null;
  MktCap: number | null;
}

export interface ScreenerStock {
  code: string; // 4桁コード (e.g. "7203")
  rawCode: string; // 5桁コード (e.g. "72030")
  name: string;
  market: string;
  sector: string;
  scaleCat: string;
  currentPrice: number;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  volume: number;
  tradingValue: number; // 売買代金 (円)
  marketCap: number | null; // 百万円
  dpsAnnual: number | null; // 1株配当金 (円)
  dividendYield: number | null; // %
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null; // %
  isJpx400: boolean;
  isTopix100: boolean;
  isPrime: boolean;
}

export type ScreenerUniverse = 'jpx400' | 'topix100' | 'prime' | 'all';

export interface ScreenerFilters {
  universe: ScreenerUniverse;
  minDividendYield: number | null;
  maxPer: number | null;
  maxPbr: number | null;
  minMarketCapOku: number | null; // 億円単位
  minTradingValueOku: number | null; // 億円単位 (売買代金)
  sector: string; // 'all' または 33業種名
  searchQuery: string; // コードまたは社名
}

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  universe: 'jpx400',
  minDividendYield: 2.5,
  maxPer: null,
  maxPbr: null,
  minMarketCapOku: null,
  minTradingValueOku: 5,
  sector: 'all',
  searchQuery: '',
};

export interface CashFlowPeriodItem {
  periodLabel: string; // 例: "2026/03期"
  curPerEn: string; // "2026-03-31"
  cfo: number | null; // 営業活動CF (百万円)
  cfi: number | null; // 投資活動CF (百万円)
  fcf: number | null; // フリーCF (百万円)
}

export interface WatchlistFinancials {
  // 配当情報 (公式開示サマリーから算出した最新値)
  dpsAnnual: number | null; // 1株当たり年間配当金 (円)
  dpsType: 'forecast' | 'actual' | null;
  dividendYield: number | null; // 配当利回り (%)

  // 1. 持続力 (Sustainability)
  latestCfo: number | null; // 直近期 営業活動CF (百万円)
  latestCfi: number | null; // 直近期 投資活動CF (百万円)
  latestFcf: number | null; // 直近期 フリーCF (百万円)
  cfHistory: CashFlowPeriodItem[]; // 過去5期分のキャッシュフロー詳細履歴 (古い期 -> 新しい期)
  fcfPositiveCount: number; // 過去5期中FCF黒字の期数 (0〜5)
  fcfTotalCount: number; // 計算対象の本決算期数
  isFcfConsistentlyPositive: boolean; // 恒常的プラスか (直近黒字かつ過半数プラス)
  
  nonReductionYears: number; // 過去5期における非減配期数
  consecutiveDividendGrowthYears: number; // 連続増配年数
  isNoDividendCut5Years: boolean; // 過去5期で減配ゼロか

  equityRatio: number | null; // 自己資本比率 (%)
  isEquityRatioSafe: boolean; // 40%以上 (健全)
  isEquityRatioSolid: boolean; // 60%超 (強固)

  equityGrowthTrend: 'growing' | 'stable' | 'decreasing' | 'unknown'; // 自己資本・内部留保の推移
  equity5YearChangePercent: number | null; // 自己資本5年変化率 (%)

  // 2. 還元方針 (Shareholder Return)
  payoutRatio: number | null; // 配当性向 (%)
  payoutRatioStatus: 'healthy' | 'acceptable' | 'warning' | 'danger' | 'unknown'; // 健全度区分
  
  doe: number | null; // DOE 自己資本配当率 (%)
  isDoeHigh: boolean; // 2.5%以上
  isDoeTopTier: boolean; // 3.5%以上

  buybackDetected: boolean; // 自社株買い実施検知

  // 3. 事業基盤 (Business Fundamentals)
  opMargin: number | null; // 営業利益率 (%)
  isOpMarginHigh: boolean; // 8%以上
  isOpMarginTopTier: boolean; // 10%以上

  roe: number | null; // ROE (%)
  isRoeGood: boolean; // 8%以上

  roa: number | null; // ROA (%)
  isRoaGood: boolean; // 5%以上

  eps5YearCagr: number | null; // EPS 5年年平均成長率 (%)
  epsTrend: 'growing' | 'stable' | 'decreasing' | 'unknown'; // EPS推移

  // 総合判定
  scorePassed: number; // 基準達成項目数
  scoreTotal: number; // 判定対象項目数
}

export interface WatchlistItem extends ScreenerStock {
  addedAt: number;
  financials?: WatchlistFinancials | null;
  betaAnalysis?: BetaAnalysis | null;
}

