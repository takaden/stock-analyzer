import type { WatchlistFinancials, BetaAnalysis, CategoryScores } from '../types/jquants.ts';

export interface WatchlistMetricsItem extends WatchlistFinancials {
  betaAnalysis: BetaAnalysis | null;
}

/**
 * Cloudflare D1 (calculated_metrics テーブル) の行オブジェクトを
 * フロントエンド向けの財務指標およびベータ値オブジェクトに変換する純粋マッパー関数
 */
export function mapCalculatedMetricsRowToItem(r: any): WatchlistMetricsItem {
  const eqRatio = r.equity_ratio;
  const doeVal = r.doe;
  const opMarginVal = r.op_margin;
  const payoutStatus =
    r.payout_ratio_status === 'moderate'
      ? 'acceptable'
      : (r.payout_ratio_status ?? 'unknown');

  // 4観点スコアの集計 (全10項目: 普遍的・時系列規律ベース)
  let dividendPassed = 0;
  // ① 過去5年非減配または3年累進
  if (Boolean(r.is_no_dividend_cut_5years) || (r.non_reduction_years != null && r.non_reduction_years >= 3)) dividendPassed++;
  // ② 配当性向が健全 (0〜70%)
  if (payoutStatus === 'healthy' || payoutStatus === 'acceptable') dividendPassed++;
  // ③ 資本還元意識 (DOE 2.5%以上 または 自社株買い実施)
  if (Boolean(r.is_doe_high) || Boolean(r.buyback_detected)) dividendPassed++;

  let financialPassed = 0;
  // ④ 自己資本（純資産）が中長期で保全（減少傾向でない）
  if (r.equity_growth_trend === 'growing' || r.equity_growth_trend === 'stable') financialPassed++;
  // ⑤ 過去3期FCFが継続プラス
  if (Boolean(r.is_fcf_consistently_positive)) financialPassed++;

  let profitabilityPassed = 0;
  // ⑥ 本業の営業CFが黒字
  if (r.latest_cfo != null && r.latest_cfo > 0) profitabilityPassed++;
  // ⑦ ROE 8%以上 (資本コスト達成)
  if (Boolean(r.is_roe_good)) profitabilityPassed++;
  // ⑧ 資本還元・効率規律 (ROE 10%以上 または DOE 3.5%以上)
  const isCapitalDisciplineGood = (r.roe != null && r.roe >= 10.0) || (doeVal != null && doeVal >= 3.5);
  if (isCapitalDisciplineGood) profitabilityPassed++;

  let growthPassed = 0;
  // ⑨ 自己資本推移が成長傾向
  if (r.equity_growth_trend === 'growing') growthPassed++;
  // ⑩ EPS推移が成長傾向
  if (r.eps_trend === 'growing') growthPassed++;

  const scorePassed = dividendPassed + financialPassed + profitabilityPassed + growthPassed;

  const categoryScores: CategoryScores = {
    dividend: { passed: dividendPassed, total: 3 },
    financial: { passed: financialPassed, total: 2 },
    profitability: { passed: profitabilityPassed, total: 3 },
    growth: { passed: growthPassed, total: 2 },
  };

  return {
    dpsAnnual: r.dps_annual,
    dpsType: r.dps_type,
    dividendYield: r.dividend_yield,
    latestCfo: r.latest_cfo,
    latestCfi: r.latest_cfi,
    latestFcf: r.latest_fcf,
    cfHistory: r.cf_history_json ? JSON.parse(r.cf_history_json) : [],
    fcfPositiveCount: r.fcf_positive_count,
    fcfTotalCount: r.fcf_total_count,
    isFcfConsistentlyPositive: Boolean(r.is_fcf_consistently_positive),
    nonReductionYears: r.non_reduction_years,
    consecutiveDividendGrowthYears: r.consecutive_dividend_growth_years ?? 0,
    isNoDividendCut5Years: Boolean(r.is_no_dividend_cut_5years),
    equityRatio: eqRatio,
    isEquityRatioSafe: eqRatio != null ? eqRatio >= 40 : false,
    isEquityRatioSolid: eqRatio != null ? eqRatio >= 60 : false,
    equityGrowthTrend: r.equity_growth_trend || 'unknown',
    equity5YearChangePercent: r.equity_5year_change_percent ?? null,
    payoutRatio: r.payout_ratio,
    payoutRatioStatus: payoutStatus,
    doe: doeVal,
    isDoeHigh: Boolean(r.is_doe_high),
    isDoeTopTier: doeVal != null ? doeVal >= 3.5 : false,
    buybackDetected: Boolean(r.buyback_detected),
    opMargin: opMarginVal,
    isOpMarginHigh: opMarginVal != null ? opMarginVal >= 8 : false,
    isOpMarginTopTier: opMarginVal != null ? opMarginVal >= 10 : false,
    roe: r.roe,
    isRoeGood: Boolean(r.is_roe_good),
    roa: r.roa,
    isRoaGood: Boolean(r.is_roa_good),
    eps5YearCagr: r.eps_5year_cagr,
    epsTrend: r.eps_trend,
    betaAnalysis: r.beta_1year != null ? {
      beta1Year: r.beta_1year,
      beta3Year: r.beta_3year,
      beta5Year: r.beta_5year,
      correlation: r.beta_correlation,
      category: r.beta_category,
      label: r.beta_label,
      badgeEmoji: r.beta_badge_emoji,
      description: '',
      dataDays: 0,
    } : null,
    scorePassed: scorePassed,
    scoreTotal: 10,
    categoryScores,
  };
}
