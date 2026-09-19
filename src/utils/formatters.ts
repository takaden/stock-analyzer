/**
 * 日本の株式表記用フォーマッタ
 */

// 金額（円）: 3,150円
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}円`;
}

// 騰落（前日比）: +25円 (+0.80%)
export function formatPriceChange(change: number | null | undefined, percent: number | null | undefined): string {
  if (change === null || change === undefined || isNaN(change)) return '-';
  const sign = change > 0 ? '+' : '';
  const changeStr = `${sign}${change.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}円`;
  if (percent === null || percent === undefined || isNaN(percent)) return changeStr;
  const pSign = percent > 0 ? '+' : '';
  return `${changeStr} (${pSign}${percent.toFixed(2)}%)`;
}

// パーセント表記: 3.15%
export function formatPercent(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

// 倍率表記 (PER, PBR): 10.5倍
export function formatRatio(value: number | null | undefined, digits: number = 1): string {
  if (value === null || value === undefined || isNaN(value) || value <= 0) return '-';
  return `${value.toFixed(digits)}倍`;
}

// 出来高: 30,864,600株
export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value.toLocaleString('ja-JP')}株`;
}

// 時価総額（百万円単位の入力 -> 兆 / 億円 表記）
export function formatMarketCap(mktCapInMillions: number | null | undefined): string {
  if (mktCapInMillions === null || mktCapInMillions === undefined || isNaN(mktCapInMillions)) return '-';
  
  // 百万円単位なので、100万円 = 0.01億円
  // 1,000,000 百万円 = 1兆円 (1,000,000 * 1,000,000 = 10^12)
  // 100 百万円 = 1億円 (100 * 1,000,000 = 10^8)
  const oku = mktCapInMillions / 100; // 億円単位
  if (oku >= 10000) {
    const cho = oku / 10000;
    return `${cho.toFixed(2)}兆円`;
  }
  return `${oku.toFixed(0)}億円`;
}

// 日付フォーマット: 2026/06/23
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return dateStr.replace(/-/g, '/');
}

// キャッシュフロー（百万円単位 -> 符号付き 兆 / 億円 表記）: +3.95兆円, -790億円
export function formatCashFlow(valInMillions: number | null | undefined): string {
  if (valInMillions === null || valInMillions === undefined || isNaN(valInMillions)) return '-';
  const isNeg = valInMillions < 0;
  const absMillions = Math.abs(valInMillions);
  const oku = absMillions / 100;
  let text = '';
  if (oku >= 10000) {
    text = `${(oku / 10000).toFixed(2)}兆円`;
  } else {
    text = `${oku.toFixed(0)}億円`;
  }
  return isNeg ? `-${text}` : `+${text}`;
}

// 売買代金（円単位の入力 -> 兆 / 億円 / 万円 表記）: 1.42兆円, 45.8億円, 8,500万円
export function formatTradingValue(valInYen: number | null | undefined): string {
  if (valInYen === null || valInYen === undefined || isNaN(valInYen)) return '-';
  const oku = valInYen / 100_000_000;
  if (oku >= 10000) {
    const cho = oku / 10000;
    return `${cho.toFixed(2)}兆円`;
  }
  if (oku >= 1) {
    return `${oku.toFixed(1)}億円`;
  }
  const man = valInYen / 10_000;
  return `${man.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}万円`;
}
