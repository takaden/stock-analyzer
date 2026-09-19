-- Cloudflare D1 マイグレーション 0001
-- daily_quotes への trading_value (売買代金: 円) 列の追加と v_screener_stocks ビューの再作成

-- 1. daily_quotes テーブルに trading_value 列を追加
ALTER TABLE daily_quotes ADD COLUMN trading_value REAL;

-- 2. スクリーナー配信用統合ビューを再作成 (tradingValue 列を包含)
DROP VIEW IF EXISTS v_screener_stocks;
CREATE VIEW IF NOT EXISTS v_screener_stocks AS
SELECT
  s.code,
  s.raw_code AS rawCode,
  s.name,
  s.market,
  s.sector,
  s.scale_cat AS scaleCat,
  s.is_jpx400 AS isJpx400,
  s.is_topix100 AS isTopix100,
  s.is_prime AS isPrime,
  q.date AS latestDate,
  COALESCE(q.close, 0) AS currentPrice,
  q.prev_close AS previousClose,
  q.price_change AS priceChange,
  q.price_change_percent AS priceChangePercent,
  COALESCE(q.volume, 0) AS volume,
  COALESCE(q.trading_value, CAST(q.close * q.volume AS REAL), 0) AS tradingValue,
  COALESCE(q.market_cap, 0) AS marketCap,
  m.dps_annual AS dpsAnnual,
  m.dividend_yield AS dividendYield,
  v.per,
  v.fwd_per AS fwdPer,
  v.pbr,
  COALESCE(m.roe, v.fwd_roe, v.roe) AS roe,
  m.latest_fcf AS latestFcf,
  m.equity_ratio AS equityRatio,
  m.doe,
  m.beta_1year AS beta1Year,
  m.beta_category AS betaCategory,
  m.beta_label AS betaLabel,
  m.beta_badge_emoji AS betaBadgeEmoji
FROM stocks s
LEFT JOIN daily_quotes q ON s.code = q.code AND q.date = (SELECT MAX(date) FROM daily_quotes WHERE code = s.code)
LEFT JOIN valuations v ON s.code = v.code AND v.date = (SELECT MAX(date) FROM valuations WHERE code = s.code)
LEFT JOIN calculated_metrics m ON s.code = m.code;
