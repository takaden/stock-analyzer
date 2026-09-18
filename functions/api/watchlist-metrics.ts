// Cloudflare Pages Functions: ウォッチリスト詳細財務指標API
// D1 の calculated_metrics テーブルから指定された銘柄コード群の事前計算済み指標を一括取得

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding "DB" not found.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const url = new URL(request.url);
  const codesParam = url.searchParams.get('codes'); // カンマ区切り: '7203,1928,8306'

  if (!codesParam) {
    return new Response(JSON.stringify({ data: {} }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const codes = codesParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length === 0) {
    return new Response(JSON.stringify({ data: {} }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // プレースホルダ (? , ? , ?) を生成
    const placeholders = codes.map(() => '?').join(',');
    const query = `SELECT * FROM calculated_metrics WHERE code IN (${placeholders})`;

    const { results } = await env.DB.prepare(query).bind(...codes).all();

    // Map 形式 (code -> Record) に整形
    const metricsMap: Record<string, any> = {};
    for (const r of results as any[]) {
      metricsMap[r.code] = {
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
        isNoDividendCut5Years: Boolean(r.is_no_dividend_cut_5years),
        equityRatio: r.equity_ratio,
        payoutRatio: r.payout_ratio,
        payoutRatioStatus: r.payout_ratio_status,
        doe: r.doe,
        isDoeHigh: Boolean(r.is_doe_high),
        opMargin: r.op_margin,
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
        } : null,
        scorePassed: r.score_passed,
        scoreTotal: r.score_total,
      };
    }

    return new Response(JSON.stringify({ data: metricsMap }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('Error querying watchlist metrics from D1:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch watchlist metrics' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
