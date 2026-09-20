-- Cloudflare D1 マイグレーション 0002
-- calculated_metrics への欠落財務カラム追加 (連続増配年数・自社株買い・自己資本推移)

ALTER TABLE calculated_metrics ADD COLUMN consecutive_dividend_growth_years INTEGER;
ALTER TABLE calculated_metrics ADD COLUMN buyback_detected INTEGER DEFAULT 0;
ALTER TABLE calculated_metrics ADD COLUMN equity_growth_trend TEXT;
ALTER TABLE calculated_metrics ADD COLUMN equity_5year_change_percent REAL;
