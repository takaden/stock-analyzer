import fs from 'node:fs';
import path from 'node:path';
import {
  fetchAllMasters,
  fetchLatestTradingDate,
  fetchDailyBarsByDate,
  fetchValuationsByDate,
  fetchFinsByDate,
  fetchTopixBars,
  sleep,
} from './lib/jquantsClient';
import { buildCalculatedMetricsRow } from './lib/metricsCalculator';
import { escapeSql } from './lib/sqlUtils';
import type { FinSummary } from '../src/types/jquants';
import { JPX400_UNIVERSE } from '../src/data/jpx400Data';

const CACHE_DIR = path.resolve('batch/.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function main() {
  console.log('🚀 Starting Initial Historical Data Ingestion for D1...');

  // 1. 全銘柄マスター取得
  const masters = await fetchAllMasters();
  // 普通株 (ProdCat === '011') のみ対象 (ETF等除外)
  const commonStocks = masters.filter((m) => m.ProdCat === '011');
  console.log(`✅ Loaded ${commonStocks.length} common stocks from master.`);

  // 2. 最新営業日と前営業日を特定
  const { latestDate, prevDate } = await fetchLatestTradingDate();
  console.log(`📅 Latest Trading Date: ${latestDate}, Prev Date: ${prevDate}`);

  // 3. 最新日足・前日日足・バリュエーションを一括取得
  const [latestBars, prevBars, valuations] = await Promise.all([
    fetchDailyBarsByDate(latestDate),
    fetchDailyBarsByDate(prevDate),
    fetchValuationsByDate(latestDate),
  ]);
  console.log(`✅ Fetched: ${latestBars.length} daily bars, ${valuations.length} valuations.`);

  const prevCloseMap = new Map<string, number>();
  prevBars.forEach((b) => prevCloseMap.set(b.Code, b.C));

  const barMap = new Map<string, (typeof latestBars)[0]>();
  latestBars.forEach((b) => barMap.set(b.Code, b));

  const valMap = new Map<string, (typeof valuations)[0]>();
  valuations.forEach((v) => valMap.set(v.Code, v));

  // TOPIX 日足取得
  const topixBars = await fetchTopixBars();
  console.log(`✅ Fetched ${topixBars.length} TOPIX bars for beta calculation.`);

  // 4. 過去250営業日の決算開示（/fins/summary?date=...）を収集
  // TOPIX日足の日付リストを営業日カレンダーとして利用（過去約250営業日）
  const tradingDates = topixBars.map((b) => b.Date).filter((d) => d <= latestDate);
  // 直近1年分（約250日）
  const targetDates = tradingDates.slice(-250);
  console.log(`📅 Target disclosure dates to collect: ${targetDates.length} trading days.`);

  const finsCachePath = path.join(CACHE_DIR, 'all_fins_cache.json');
  let finsByCode: Record<string, FinSummary[]> = {};
  if (fs.existsSync(finsCachePath)) {
    try {
      finsByCode = JSON.parse(fs.readFileSync(finsCachePath, 'utf-8'));
      console.log(`💾 Loaded existing fins cache for ${Object.keys(finsByCode).length} codes.`);
    } catch (e) {
      console.warn('Failed to parse existing fins cache:', e);
    }
  }

  const processedDatesPath = path.join(CACHE_DIR, 'processed_dates.json');
  let processedDates: Set<string> = new Set();
  if (fs.existsSync(processedDatesPath)) {
    try {
      processedDates = new Set(JSON.parse(fs.readFileSync(processedDatesPath, 'utf-8')));
      console.log(`💾 Loaded ${processedDates.size} already processed disclosure dates.`);
    } catch (e) {
      console.warn('Failed to parse processed dates:', e);
    }
  }

  let newFinsCount = 0;
  for (let i = 0; i < targetDates.length; i++) {
    const dStr = targetDates[i];
    if (processedDates.has(dStr)) continue;

    console.log(`[${i + 1}/${targetDates.length}] Fetching disclosures for date: ${dStr}...`);
    try {
      const dailyFins = await fetchFinsByDate(dStr);
      dailyFins.forEach((f) => {
        const code4 = f.Code.replace(/0$/, '');
        if (!finsByCode[code4]) finsByCode[code4] = [];
        // 重複防止 (DiscNo または DiscDate + CurPerType)
        const exists = finsByCode[code4].some(
          (existing) => existing.DiscDate === f.DiscDate && existing.CurPerType === f.CurPerType
        );
        if (!exists) {
          finsByCode[code4].push(f as FinSummary);
          newFinsCount++;
        }
      });

      processedDates.add(dStr);

      // 10日ごとに中間セーブ
      if (i % 10 === 0) {
        fs.writeFileSync(finsCachePath, JSON.stringify(finsByCode), 'utf-8');
        fs.writeFileSync(processedDatesPath, JSON.stringify(Array.from(processedDates)), 'utf-8');
      }
    } catch (err) {
      console.warn(`Error fetching date ${dStr}:`, err);
    }
  }

  fs.writeFileSync(finsCachePath, JSON.stringify(finsByCode), 'utf-8');
  fs.writeFileSync(processedDatesPath, JSON.stringify(Array.from(processedDates)), 'utf-8');
  console.log(`✅ Disclosure collection complete. Total codes with fins: ${Object.keys(finsByCode).length}, New: ${newFinsCount}`);

  // 5. SQL INSERT 文の生成
  console.log('📝 Generating SQL statements for D1...');
  const sqlStatements: string[] = [];

  const nowStr = new Date().toISOString();

  const jpx400CodeSet = new Set(JPX400_UNIVERSE.map((u) => u.code));

  // (A) stocks
  for (const s of commonStocks) {
    const code4 = s.Code.replace(/0$/, '');
    const isJpx400 = jpx400CodeSet.has(code4) ? 1 : 0;
    const isTopix100 = s.ScaleCat === 'TOPIX Core30' || s.ScaleCat === 'TOPIX Large70' ? 1 : 0;
    const isPrime = s.MktNm === 'プライム' ? 1 : 0;

    sqlStatements.push(`INSERT OR REPLACE INTO stocks (code, raw_code, name, market, sector, scale_cat, is_jpx400, is_topix100, is_prime, updated_at) VALUES (${escapeSql(code4)}, ${escapeSql(s.Code)}, ${escapeSql(s.CoName)}, ${escapeSql(s.MktNm)}, ${escapeSql(s.S33Nm)}, ${escapeSql(s.ScaleCat)}, ${isJpx400}, ${isTopix100}, ${isPrime}, ${escapeSql(nowStr)});`);
  }

  // (B) daily_quotes
  for (const [rawCode, bar] of barMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    const prevClose = prevCloseMap.get(rawCode) ?? null;
    const priceChange = prevClose != null && bar.C ? bar.C - prevClose : null;
    const priceChangePercent = prevClose != null && prevClose > 0 && priceChange != null ? (priceChange / prevClose) * 100 : null;

    sqlStatements.push(`INSERT OR REPLACE INTO daily_quotes (code, date, close, open, high, low, volume, trading_value, prev_close, price_change, price_change_percent, market_cap, updated_at) VALUES (${escapeSql(code4)}, ${escapeSql(bar.Date)}, ${escapeSql(bar.C)}, ${escapeSql(bar.O)}, ${escapeSql(bar.H)}, ${escapeSql(bar.L)}, ${escapeSql(bar.Vo)}, ${escapeSql(bar.Va ?? (bar.C && bar.Vo ? bar.C * bar.Vo : null))}, ${escapeSql(prevClose)}, ${escapeSql(priceChange)}, ${escapeSql(priceChangePercent)}, ${escapeSql(bar.MktCap ?? null)}, ${escapeSql(nowStr)});`);
  }

  // (C) valuations
  for (const [rawCode, val] of valMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    sqlStatements.push(`INSERT OR REPLACE INTO valuations (code, date, per, fwd_per, pbr, roe, fwd_roe, updated_at) VALUES (${escapeSql(code4)}, ${escapeSql(val.Date)}, ${escapeSql(val.PER ?? null)}, ${escapeSql(val.FwdPER ?? null)}, ${escapeSql(val.PBR ?? null)}, ${escapeSql(val.ROE ? val.ROE * 100 : null)}, ${escapeSql(val.FwdROE ? val.FwdROE * 100 : null)}, ${escapeSql(nowStr)});`);
  }

  // (D) calculated_metrics
  for (const s of commonStocks) {
    const code4 = s.Code.replace(/0$/, '');
    const fins = (finsByCode[code4] || []).sort((a, b) => b.DiscDate.localeCompare(a.DiscDate));
    const bar = barMap.get(s.Code);
    const currentPrice = bar?.C || 0;

    const row = buildCalculatedMetricsRow(code4, fins, currentPrice, undefined, topixBars);

    sqlStatements.push(`INSERT OR REPLACE INTO calculated_metrics (
      code, dps_annual, dps_type, dividend_yield, latest_cfo, latest_cfi, latest_fcf,
      cf_history_json, fcf_positive_count, fcf_total_count, is_fcf_consistently_positive,
      non_reduction_years, consecutive_dividend_growth_years, is_no_dividend_cut_5years,
      equity_ratio, equity_growth_trend, equity_5year_change_percent, payout_ratio,
      payout_ratio_status, doe, is_doe_high, buyback_detected, op_margin, roe, is_roe_good, roa,
      is_roa_good, eps_5year_cagr, eps_trend, beta_1year, beta_3year, beta_5year,
      beta_correlation, beta_category, beta_label, beta_badge_emoji, score_passed,
      score_total, updated_at
    ) VALUES (
      ${escapeSql(row.code)}, ${escapeSql(row.dps_annual)}, ${escapeSql(row.dps_type)}, ${escapeSql(row.dividend_yield)},
      ${escapeSql(row.latest_cfo)}, ${escapeSql(row.latest_cfi)}, ${escapeSql(row.latest_fcf)}, ${escapeSql(row.cf_history_json)},
      ${row.fcf_positive_count}, ${row.fcf_total_count}, ${row.is_fcf_consistently_positive},
      ${row.non_reduction_years}, ${row.consecutive_dividend_growth_years}, ${row.is_no_dividend_cut_5years},
      ${escapeSql(row.equity_ratio)}, ${escapeSql(row.equity_growth_trend)}, ${escapeSql(row.equity_5year_change_percent)},
      ${escapeSql(row.payout_ratio)}, ${escapeSql(row.payout_ratio_status)}, ${escapeSql(row.doe)},
      ${row.is_doe_high}, ${row.buyback_detected}, ${escapeSql(row.op_margin)}, ${escapeSql(row.roe)}, ${row.is_roe_good},
      ${escapeSql(row.roa)}, ${row.is_roa_good}, ${escapeSql(row.eps_5year_cagr)}, ${escapeSql(row.eps_trend)},
      ${escapeSql(row.beta_1year)}, ${escapeSql(row.beta_3year)}, ${escapeSql(row.beta_5year)},
      ${escapeSql(row.beta_correlation)}, ${escapeSql(row.beta_category)}, ${escapeSql(row.beta_label)},
      ${escapeSql(row.beta_badge_emoji)}, ${row.score_passed}, ${row.score_total}, ${escapeSql(row.updated_at)}
    );`);
  }

  const sqlOutPath = path.resolve('schema/initial_seed.sql');
  fs.writeFileSync(sqlOutPath, sqlStatements.join('\n'), 'utf-8');
  console.log(`🎉 Successfully generated SQL seed file: ${sqlOutPath} (${(fs.statSync(sqlOutPath).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('👉 You can execute this file into local D1 with:');
  console.log('   npx wrangler d1 execute jquants-db --local --file=./schema/initial_seed.sql');
}

main().catch((err) => {
  console.error('Initialization failed:', err);
  process.exitCode = 1;
});
