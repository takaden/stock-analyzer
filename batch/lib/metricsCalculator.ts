import type { FinSummary, TopixBar, DailyBar } from '../../src/types/jquants';
import { calculateWatchlistFinancials, extractLatestDps, calculateBeta } from '../../src/utils/indicators.ts';

export interface CalculatedMetricsRow {
  code: string;
  dps_annual: number | null;
  dps_type: string | null;
  dividend_yield: number | null;
  latest_cfo: number | null;
  latest_cfi: number | null;
  latest_fcf: number | null;
  cf_history_json: string | null;
  fcf_positive_count: number;
  fcf_total_count: number;
  is_fcf_consistently_positive: number;
  non_reduction_years: number;
  consecutive_dividend_growth_years: number;
  is_no_dividend_cut_5years: number;
  equity_ratio: number | null;
  equity_growth_trend: string | null;
  equity_5year_change_percent: number | null;
  payout_ratio: number | null;
  payout_ratio_status: string | null;
  doe: number | null;
  is_doe_high: number;
  buyback_detected: number;
  op_margin: number | null;
  roe: number | null;
  is_roe_good: number;
  roa: number | null;
  is_roa_good: number;
  eps_5year_cagr: number | null;
  eps_trend: string | null;
  beta_1year: number | null;
  beta_3year: number | null;
  beta_5year: number | null;
  beta_correlation: number | null;
  beta_category: string | null;
  beta_label: string | null;
  beta_badge_emoji: string | null;
  score_passed: number;
  score_total: number;
  updated_at: string;
}

/**
 * 銘柄の財務開示データ・株価・日足から事前計算済み指標行を構築
 */
export function buildCalculatedMetricsRow(
  code: string,
  fins: FinSummary[],
  currentPrice: number,
  stockBars?: DailyBar[],
  topixBars?: TopixBar[]
): CalculatedMetricsRow {
  const nowStr = new Date().toISOString();

  // 最新配当金・配当利回り
  const { dpsAnnual, dpsType } = extractLatestDps(fins);
  const dividendYield =
    dpsAnnual != null && currentPrice > 0 ? (dpsAnnual / currentPrice) * 100 : null;

  // 11財務指標の計算
  const financials = calculateWatchlistFinancials(fins, currentPrice, dpsAnnual);

  // ベータ値の計算 (日足とTOPIX日足が提供されている場合)
  let beta = null;
  if (stockBars && stockBars.length >= 20 && topixBars && topixBars.length >= 20) {
    beta = calculateBeta(stockBars, topixBars);
  }

  return {
    code,
    dps_annual: dpsAnnual,
    dps_type: dpsType,
    dividend_yield: dividendYield ? Math.round(dividendYield * 100) / 100 : null,
    latest_cfo: financials?.latestCfo ?? null,
    latest_cfi: financials?.latestCfi ?? null,
    latest_fcf: financials?.latestFcf ?? null,
    cf_history_json: financials?.cfHistory ? JSON.stringify(financials.cfHistory) : null,
    fcf_positive_count: financials?.fcfPositiveCount ?? 0,
    fcf_total_count: financials?.fcfTotalCount ?? 0,
    is_fcf_consistently_positive: financials?.isFcfConsistentlyPositive ? 1 : 0,
    non_reduction_years: financials?.nonReductionYears ?? 0,
    consecutive_dividend_growth_years: financials?.consecutiveDividendGrowthYears ?? 0,
    is_no_dividend_cut_5years: financials?.isNoDividendCut5Years ? 1 : 0,
    equity_ratio: financials?.equityRatio ?? null,
    equity_growth_trend: financials?.equityGrowthTrend ?? null,
    equity_5year_change_percent: financials?.equity5YearChangePercent ?? null,
    payout_ratio: financials?.payoutRatio ?? null,
    payout_ratio_status: financials?.payoutRatioStatus ?? null,
    doe: financials?.doe ?? null,
    is_doe_high: financials?.isDoeHigh ? 1 : 0,
    buyback_detected: financials?.buybackDetected ? 1 : 0,
    op_margin: financials?.opMargin ?? null,
    roe: financials?.roe ?? null,
    is_roe_good: financials?.isRoeGood ? 1 : 0,
    roa: financials?.roa ?? null,
    is_roa_good: financials?.isRoaGood ? 1 : 0,
    eps_5year_cagr: financials?.eps5YearCagr ?? null,
    eps_trend: financials?.epsTrend ?? null,
    beta_1year: beta?.beta1Year ?? null,
    beta_3year: beta?.beta3Year ?? null,
    beta_5year: beta?.beta5Year ?? null,
    beta_correlation: beta?.correlation ?? null,
    beta_category: beta?.category ?? null,
    beta_label: beta?.label ?? null,
    beta_badge_emoji: beta?.badgeEmoji ?? null,
    score_passed: financials?.scorePassed ?? 0,
    score_total: financials?.scoreTotal ?? 10,
    updated_at: nowStr,
  };
}
