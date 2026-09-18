import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatCurrency,
  formatPriceChange,
  formatPercent,
  formatRatio,
  formatMarketCap,
  formatVolume,
  formatCashFlow,
} from '../src/utils/formatters.ts';

import {
  calculateSMA,
  parseNumber,
  calculateWatchlistFinancials,
  calculateBeta,
  generateChartMarkers,
  extractDividendSchedule,
  extractLatestDps,
  extractAnnualEps,
  calculateRoeFromFins,
} from '../src/utils/indicators.ts';

test('formatters', async (t) => {
  await t.test('formatCurrency handles values properly', () => {
    assert.equal(formatCurrency(3150), '3,150円');
    assert.equal(formatCurrency(0), '0円');
    assert.equal(formatCurrency(null), '-');
  });

  await t.test('formatPriceChange handles positive and negative', () => {
    assert.equal(formatPriceChange(25, 0.8), '+25円 (+0.80%)');
    assert.equal(formatPriceChange(-15, -0.45), '-15円 (-0.45%)');
  });

  await t.test('formatPercent formats decimal percentage', () => {
    assert.equal(formatPercent(3.1415), '3.14%');
    assert.equal(formatPercent(null), '-');
  });

  await t.test('formatRatio formats PER and PBR', () => {
    assert.equal(formatRatio(10.52), '10.5倍');
    assert.equal(formatRatio(null), '-');
  });

  await t.test('formatMarketCap handles cho and oku', () => {
    // 51,392,210 百万円 = 51.39 兆円
    assert.equal(formatMarketCap(51392210), '51.39兆円');
    // 50,000 百万円 = 500 億円
    assert.equal(formatMarketCap(50000), '500億円');
  });

  await t.test('formatVolume formats stock shares', () => {
    assert.equal(formatVolume(30864600), '30,864,600株');
  });

  await t.test('formatCashFlow formats cash flow in cho and oku with signs', () => {
    assert.equal(formatCashFlow(3950000), '+3.95兆円');
    assert.equal(formatCashFlow(-79000), '-790億円');
    assert.equal(formatCashFlow(45000), '+450億円');
    assert.equal(formatCashFlow(null), '-');
  });
});

test('indicators', async (t) => {
  await t.test('parseNumber parses numbers and formatted strings', () => {
    assert.equal(parseNumber(123.45), 123.45);
    assert.equal(parseNumber('1,234.5'), 1234.5);
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber(null), null);
  });

  await t.test('calculateSMA correctly averages prices over period', () => {
    const mockBars = [
      { Date: '2026-01-01', Code: '72030', O: 10, H: 10, L: 10, C: 10, Vo: 100 },
      { Date: '2026-01-02', Code: '72030', O: 20, H: 20, L: 20, C: 20, Vo: 100 },
      { Date: '2026-01-03', Code: '72030', O: 30, H: 30, L: 30, C: 30, Vo: 100 },
    ];
    const sma2 = calculateSMA(mockBars as any, 2);
    assert.equal(sma2.length, 2);
    assert.equal(sma2[0].time, '2026-01-02');
    assert.equal(sma2[0].value, 15); // (10+20)/2
    assert.equal(sma2[1].time, '2026-01-03');
    assert.equal(sma2[1].value, 25); // (20+30)/2
  });
});

import { JPX400_UNIVERSE, JPX400_CODE_MAP, DEFAULT_WATCHLIST_CODES } from '../src/data/jpx400Data.ts';

test('jpx400Data universe', async (t) => {
  await t.test('universe contains 400 stocks and key majors', () => {
    assert.equal(JPX400_UNIVERSE.length, 400);
    assert.ok(JPX400_CODE_MAP.has('7203')); // トヨタ
    assert.ok(JPX400_CODE_MAP.has('8306')); // 三菱UFJ
    assert.ok(JPX400_CODE_MAP.has('9432')); // NTT
    assert.ok(JPX400_CODE_MAP.has('8031')); // 三井物産
    assert.ok(JPX400_CODE_MAP.has('1605')); // INPEX
  });

  await t.test('default watchlist in cacheService returns empty array', () => {
    // localStorageが空の場合のgetWatchlist()は空配列
    assert.deepEqual(DEFAULT_WATCHLIST_CODES, ['7203', '8306', '9432', '8031', '1605']);
  });

  await t.test('all items have code and name and proper market', () => {
    JPX400_UNIVERSE.forEach((item) => {
      assert.ok(item.code.length === 4, `Code must be 4 digits: ${item.code}`);
      assert.ok(item.name.length > 0, `Name must not be empty: ${item.code}`);
      assert.ok(item.isJpx400 === true);
    });
  });
});

import { extractDividendHistory } from '../src/utils/indicators.ts';

test('extractDividendHistory', async (t) => {
  await t.test('calculates dividend history and consecutive streak accurately', () => {
    const mockFins = [
      {
        DiscDate: '2024-05-08',
        CurPerType: 'FY',
        CurPerEn: '2024-03-31',
        DivAnn: '60.0',
        PayoutRatioAnn: '0.30',
        EPS: '200.0',
      },
      {
        DiscDate: '2025-05-08',
        CurPerType: 'FY',
        CurPerEn: '2025-03-31',
        DivAnn: '75.0',
        PayoutRatioAnn: '0.35',
        EPS: '214.0',
      },
      {
        DiscDate: '2026-05-08',
        CurPerType: 'FY',
        CurPerEn: '2026-03-31',
        DivAnn: '90.0',
        PayoutRatioAnn: '0.36',
        EPS: '250.0',
        NxFDivAnn: '100.0',
        NxtFYEn: '2027-03-31',
      },
    ];

    const { history, streak } = extractDividendHistory(mockFins as any);
    assert.equal(history.length, 4); // 2024, 2025, 2026, 2027(予)
    assert.equal(history[0].dps, 60);
    assert.equal(history[1].dps, 75);
    assert.equal(history[1].changeAmount, 15);
    assert.equal(history[1].changePercent, 25);
    assert.equal(history[2].dps, 90);
    assert.equal(history[3].dps, 100);
    assert.equal(history[3].isForecast, true);
    assert.equal(streak, 3); // 60 -> 75 -> 90 -> 100 は3期連続増配
  });

  await t.test('handles empty fins gracefully', () => {
    const { history, streak } = extractDividendHistory([]);
    assert.equal(history.length, 0);
    assert.equal(streak, 0);
  });
});

import { DEFAULT_SCREENER_FILTERS } from '../src/types/jquants.ts';

test('screener filters', async (t) => {
  await t.test('default filters set dividend yield >= 2.5% and volume >= 500k', () => {
    assert.equal(DEFAULT_SCREENER_FILTERS.minDividendYield, 2.5);
    assert.equal(DEFAULT_SCREENER_FILTERS.minVolume, 500000);
    assert.equal(DEFAULT_SCREENER_FILTERS.universe, 'jpx400');
  });
});

test('calculateWatchlistFinancials', async (t) => {
  const mockToyotaFins = [
    {
      DiscDate: '2022-05-11',
      CurPerType: 'FY',
      CurPerEn: '2022-03-31',
      Sales: '31379507000000',
      OP: '2995697000000',
      NP: '2850110000000',
      EPS: '205.23',
      TA: '67688771000000',
      Eq: '27154820000000',
      ShEq: '26245969000000',
      EqAR: '0.388',
      CFO: '3722615000000',
      CFI: '-577496000000',
      DivAnn: '52.0',
      PayoutRatioAnn: '0.253',
    },
    {
      DiscDate: '2023-05-10',
      CurPerType: 'FY',
      CurPerEn: '2023-03-31',
      Sales: '37154298000000',
      OP: '2725025000000',
      NP: '2451318000000',
      EPS: '179.47',
      TA: '74303180000000',
      Eq: '29264213000000',
      ShEq: '28338706000000',
      EqAR: '0.381',
      CFO: '2955076000000',
      CFI: '-1598890000000',
      DivAnn: '60.0',
      PayoutRatioAnn: '0.334',
    },
    {
      DiscDate: '2024-05-08',
      CurPerType: 'FY',
      CurPerEn: '2024-03-31',
      Sales: '45095325000000',
      OP: '5352934000000',
      NP: '4944933000000',
      EPS: '365.94',
      TA: '90114296000000',
      Eq: '35239338000000',
      ShEq: '34220991000000',
      EqAR: '0.380',
      CFO: '4206373000000',
      CFI: '-4998751000000',
      DivAnn: '75.0',
      PayoutRatioAnn: '0.204',
    },
    {
      DiscDate: '2025-05-08',
      CurPerType: 'FY',
      CurPerEn: '2025-03-31',
      Sales: '48036704000000',
      OP: '4795586000000',
      NP: '4765086000000',
      EPS: '359.56',
      TA: '93601350000000',
      Eq: '36878913000000',
      ShEq: '35924826000000',
      EqAR: '0.384',
      CFO: '3696934000000',
      CFI: '-4189736000000',
      DivAnn: '90.0',
      PayoutRatioAnn: '0.250',
    },
    {
      DiscDate: '2026-05-08',
      CurPerType: 'FY',
      CurPerEn: '2026-03-31',
      Sales: '50684952000000',
      OP: '3766216000000',
      NP: '3848098000000',
      EPS: '295.25',
      BPS: '3062.82',
      TA: '105522331000000',
      Eq: '41020068000000',
      ShEq: '39918854000000',
      EqAR: '0.378',
      CFO: '5472920000000',
      CFI: '-1520307000000',
      DivAnn: '95.0',
      FDivAnn: '100.0',
      PayoutRatioAnn: '0.321',
      FPayoutRatioAnn: '0.350',
      ROE: '0.096',
      TrShFY: '1861043',
    },
  ];

  await t.test('accurately calculates 11 financial indicators from FY data', () => {
    const res = calculateWatchlistFinancials(mockToyotaFins as any, 2800, 100);
    assert.ok(res !== null);

    // 1. 持続力
    // 最新営業CF = 5,472,920 百万円, 最新投資CF = -1,520,307 百万円, 最新FCF = 3,952,613 百万円
    assert.equal(res.latestCfo, 5472920);
    assert.equal(res.latestCfi, -1520307);
    assert.equal(res.latestFcf, 3952613);
    assert.equal(res.cfHistory.length, 5);
    assert.equal(res.cfHistory[0].periodLabel, '2022/03期');
    assert.equal(res.cfHistory[4].periodLabel, '2026/03期');
    assert.equal(res.cfHistory[4].cfo, 5472920);
    assert.equal(res.cfHistory[4].cfi, -1520307);
    assert.equal(res.cfHistory[4].fcf, 3952613);

    assert.equal(res.fcfPositiveCount, 3); // 2022(+), 2023(+), 2024(-), 2025(-), 2026(+)
    assert.equal(res.fcfTotalCount, 5);
    assert.equal(res.isFcfConsistentlyPositive, true);

    // 配当 (52 -> 60 -> 75 -> 90 -> 95) => 5期減配なし
    assert.equal(res.isNoDividendCut5Years, true);
    assert.equal(res.nonReductionYears, 4);

    // 自己資本比率 = 37.8%
    assert.equal(res.equityRatio, 37.8);
    assert.equal(res.isEquityRatioSafe, false); // < 40%

    // 内部留保・自己資本推移 (26.2兆 -> 39.9兆: +52.1%)
    assert.equal(res.equityGrowthTrend, 'growing');
    assert.equal(res.equity5YearChangePercent, 52.1);

    // 2. 還元方針
    // 配当性向 = 35.0% (予想) => 健全 (30-50%)
    assert.equal(res.payoutRatio, 35.0);
    assert.equal(res.payoutRatioStatus, 'healthy');

    // DOE = 100 / 3062.82 = 3.26% => 3.3%
    assert.equal(res.doe, 3.3);
    assert.equal(res.isDoeHigh, true);

    // 3. 事業基盤
    // 営業利益率 = 3766216 / 50684952 = 7.4%
    assert.equal(res.opMargin, 7.4);

    // ROE = 9.6% => 合格 (8%以上)
    assert.equal(res.roe, 9.6);
    assert.equal(res.isRoeGood, true);

    // ROA = 3848098 / 105522331 = 3.6% => 5%未満
    assert.equal(res.roa, 3.6);
    assert.equal(res.isRoaGood, false);

    // EPS 5年成長 (205.23 -> 295.25: CAGR +9.5%)
    assert.equal(res.eps5YearCagr, 9.5);
    assert.equal(res.epsTrend, 'growing');

    // 総合スコア
    assert.ok(res.scorePassed >= 5);
    assert.equal(res.scoreTotal, 10);

    // 配当金・利回り: 100円, 2800円 => 3.57%
    assert.equal(res.dpsAnnual, 100);
    assert.equal(res.dpsType, 'forecast');
    assert.equal(Math.round(res.dividendYield! * 100) / 100, 3.57);
  });

  await t.test('handles empty or null fins safely', () => {
    assert.equal(calculateWatchlistFinancials([], 1000, null), null);
    assert.equal(calculateWatchlistFinancials(null as any, 1000, null), null);
  });

  await t.test('6632 JVCKenwood pattern: prioritizes official forecast 20 yen (1.98%) over screener estimated 37.1 yen (3.67%)', () => {
    // 6632 JVCケンウッドの実開示データパターン
    const mockKenwoodFins = [
      {
        DiscDate: '2026-05-01',
        DocType: 'FYFinancialStatements_Consolidated_IFRS',
        CurFYEn: '2026-03-31',
        CurPerType: 'FY',
        DivAnn: '18.0',
        FDivAnn: '',
        EPS: '115.21',
        BPS: '1030.23',
        CFO: '25000000000',
        CFI: '-10000000000',
      },
      {
        DiscDate: '2026-08-03',
        DocType: '1QFinancialStatements_Consolidated_IFRS',
        CurFYEn: '2027-03-31',
        CurPerType: '1Q',
        DivAnn: '',
        FDivAnn: '20.0', // 最新予想: 20円 (中間10円 + 期末10円)
        EPS: '7.0',
        FEPS: '106.13',
        BPS: '1030.23',
      },
    ];

    const currentPrice = 1011.5;
    const screenerEstimatedDps = 37.1; // 誤った 0.35 推計値

    const res = calculateWatchlistFinancials(mockKenwoodFins as any, currentPrice, screenerEstimatedDps);
    assert.ok(res !== null);

    // 推計値 37.1円 / 3.67% ではなく、公式開示の 20円 / 1.98% が採用されること
    assert.equal(res.dpsAnnual, 20);
    assert.equal(res.dpsType, 'forecast');
    assert.equal(Math.round(res.dividendYield! * 100) / 100, 1.98);

    // DOE も 20円 に基づいて算出されること: 20 / 1030.23 = 1.94% => 1.9%
    assert.equal(res.doe, 1.9);

    // 配当性向も 20円 / 106.13円 = 18.84% => 18.8%
    assert.equal(res.payoutRatio, 18.8);
  });
});

test('extractLatestDps', async (t) => {
  await t.test('extracts forecast dividend when FDivAnn is present in latest record', () => {
    const fins = [
      { DiscDate: '2026-05-01', DivAnn: '18.0', FDivAnn: '' },
      { DiscDate: '2026-08-03', DivAnn: '', FDivAnn: '20.0' },
    ];
    const res = extractLatestDps(fins as any);
    assert.deepEqual(res, { dpsAnnual: 20, dpsType: 'forecast' });
  });

  await t.test('falls back to actual DivAnn when no forecast is present', () => {
    const fins = [
      { DiscDate: '2026-05-01', DivAnn: '18.0', FDivAnn: '' },
    ];
    const res = extractLatestDps(fins as any);
    assert.deepEqual(res, { dpsAnnual: 18, dpsType: 'actual' });
  });

  await t.test('returns null when fins is empty or has no valid dividend numbers', () => {
    assert.deepEqual(extractLatestDps([]), { dpsAnnual: null, dpsType: null });
    assert.deepEqual(extractLatestDps([{ DiscDate: '2026-01-01', DivAnn: '', FDivAnn: '' }] as any), {
      dpsAnnual: null,
      dpsType: null,
    });
  });
});

test('extractAnnualEps', async (t) => {
  await t.test('prioritizes full-year forecast FEPS over quarterly cumulative EPS (6632 1Q pattern)', () => {
    // 6632 1Q決算: 3ヶ月累計EPSが7.0円、通期予想FEPSが106.13円
    const fins = [
      { DiscDate: '2026-05-01', CurPerType: 'FY', EPS: '115.21', FEPS: '' },
      { DiscDate: '2026-08-03', CurPerType: '1Q', EPS: '7.0', FEPS: '106.13' },
    ];
    const res = extractAnnualEps(fins as any);
    // 7.0円ではなく通期予想の106.13円が採用されること
    assert.deepEqual(res, { eps: 106.13, epsType: 'forecast' });
  });

  await t.test('falls back to actual full-year EPS when FEPS is not published', () => {
    const fins = [
      { DiscDate: '2026-05-01', CurPerType: 'FY', EPS: '115.21', FEPS: '' },
    ];
    const res = extractAnnualEps(fins as any);
    assert.deepEqual(res, { eps: 115.21, epsType: 'actual' });
  });

  await t.test('does not use quarterly cumulative EPS when CurPerType is not FY and FEPS is empty', () => {
    const fins = [
      { DiscDate: '2026-08-03', CurPerType: '1Q', EPS: '7.0', FEPS: '' },
    ];
    const res = extractAnnualEps(fins as any);
    assert.deepEqual(res, { eps: null, epsType: null });
  });
});

test('calculateRoeFromFins', async (t) => {
  await t.test('accurately calculates ROE from latest FY NP and ShEq even when fin.ROE key is absent', () => {
    // トヨタ実例: NP = 4,944,933百万円, ShEq = 34,220,991百万円 => 14.45% => 14.5%
    const fins = [
      {
        DiscDate: '2024-05-08',
        CurPerType: 'FY',
        NP: '4944933000000',
        ShEq: '34220991000000',
        // ROEキーはAPIに存在しない
      },
      {
        DiscDate: '2024-08-01',
        CurPerType: '1Q',
        NP: '1333333000000',
      },
    ];
    const roe = calculateRoeFromFins(fins as any);
    assert.equal(roe, 14.4);
  });

  await t.test('returns null when no FY record exists or data is empty', () => {
    assert.equal(calculateRoeFromFins([]), null);
    assert.equal(calculateRoeFromFins([{ DiscDate: '2024-08-01', CurPerType: '1Q', NP: '100' }] as any), null);
  });
});

test('calculateBeta', async (t) => {
  // 30日分のテストデータ生成
  const days = 30;
  const topixBars = [];
  const defensiveBars = [];
  const cyclicalBars = [];
  const neutralBars = [];

  let topixPrice = 2000;
  let defPrice = 1000;
  let cycPrice = 1000;
  let neuPrice = 1000;

  for (let i = 0; i < days; i++) {
    const dStr = `2025-01-${String(i + 1).padStart(2, '0')}`;
    // 交互にプラスマイナスのリターン
    const marketReturn = i % 2 === 0 ? 0.02 : -0.01;
    if (i > 0) {
      topixPrice *= (1 + marketReturn);
      defPrice *= (1 + marketReturn * 0.3); // β ≈ 0.3
      cycPrice *= (1 + marketReturn * 1.6); // β ≈ 1.6
      neuPrice *= (1 + marketReturn * 1.0); // β ≈ 1.0
    }

    topixBars.push({ Date: dStr, O: topixPrice, H: topixPrice, L: topixPrice, C: topixPrice });
    defensiveBars.push({ Date: dStr, Code: '94320', O: defPrice, H: defPrice, L: defPrice, C: defPrice, Vo: 1000 });
    cyclicalBars.push({ Date: dStr, Code: '80350', O: cycPrice, H: cycPrice, L: cycPrice, C: cycPrice, Vo: 1000 });
    neutralBars.push({ Date: dStr, Code: '72030', O: neuPrice, H: neuPrice, L: neuPrice, C: neuPrice, Vo: 1000 });
  }

  await t.test('accurately identifies defensive stock (beta < 0.8)', () => {
    const res = calculateBeta(defensiveBars, topixBars);
    assert.ok(res !== undefined);
    assert.ok(res.beta1Year !== null && res.beta1Year < 0.5);
    assert.equal(res.category, 'defensive');
    assert.equal(res.label, 'ディフェンシブ');
    assert.equal(res.badgeEmoji, '🛡️');
  });

  await t.test('accurately identifies cyclical stock (beta > 1.2)', () => {
    const res = calculateBeta(cyclicalBars, topixBars);
    assert.ok(res !== undefined);
    assert.ok(res.beta1Year !== null && res.beta1Year > 1.4);
    assert.equal(res.category, 'cyclical');
    assert.equal(res.label, '景気敏感');
    assert.equal(res.badgeEmoji, '🚀');
  });

  await t.test('accurately identifies neutral market stock (0.8 <= beta <= 1.2)', () => {
    const res = calculateBeta(neutralBars, topixBars);
    assert.ok(res !== undefined);
    assert.ok(res.beta1Year !== null && res.beta1Year >= 0.95 && res.beta1Year <= 1.05);
    assert.equal(res.category, 'neutral');
    assert.equal(res.label, '市場連動');
    assert.equal(res.badgeEmoji, '⚖️');
  });

  await t.test('returns undefined for insufficient data days (< 20)', () => {
    assert.equal(calculateBeta(defensiveBars.slice(0, 10), topixBars.slice(0, 10)), undefined);
    assert.equal(calculateBeta([], []), undefined);
    assert.equal(calculateBeta(null as any, null as any), undefined);
  });
});

import { cacheService } from '../src/services/cacheService.ts';

test('cacheService in-memory caching', async (t) => {
  await t.test('returns exact memory reference on second retrieval (O(1) without re-parsing)', () => {
    const mockStock = {
      code: '7203',
      name: 'トヨタ自動車',
      historicalBars: [],
    } as any;

    cacheService.setStock('7203', mockStock);
    const firstGet = cacheService.getStock('7203');
    const secondGet = cacheService.getStock('7203');

    assert.equal(firstGet?.name, 'トヨタ自動車');
    assert.equal(firstGet, secondGet, 'Subsequent getStock calls must return the identical in-memory reference');
  });

  await t.test('betaAnalysis caching stores and retrieves correctly without needing full stock cache', () => {
    const mockBeta = {
      beta1Year: 0.85,
      beta3Year: 0.82,
      beta5Year: 0.80,
      correlation: 0.75,
      category: 'neutral',
      label: '市場連動',
      badgeEmoji: '⚖️',
      description: 'テスト用ベータ値',
    } as any;

    cacheService.setBetaAnalysis('6632', mockBeta);
    const retrieved = cacheService.getBetaAnalysis('6632');
    assert.ok(retrieved !== null);
    assert.equal(retrieved.beta1Year, 0.85);
    assert.equal(retrieved.label, '市場連動');
    assert.equal(retrieved, mockBeta, 'Must return the identical in-memory reference');
  });

  await t.test('clears in-memory cache upon clearAllStockCache', () => {
    cacheService.setStock('9999', { code: '9999', name: 'Temp' } as any);
    cacheService.setBetaAnalysis('9999', { beta1Year: 1.0 } as any);
    cacheService.clearAllStockCache();
    assert.equal(cacheService.getStock('9999'), null);
    assert.equal(cacheService.getBetaAnalysis('9999'), null);
  });
});

test('regression: cache integrity & dividend history preservation', async (t) => {
  await t.test('prevents incomplete cache without dividendHistory from being treated as complete stock data', () => {
    // デグレ再現ケース: ウォッチリスト側から空のdividendHistoryを持つ中途半端なStockDataが保存された場合
    const incompleteStock = {
      code: '8031',
      name: '三井物産',
      historicalBars: [{ Date: '2026-03-01', C: 3500 }],
      dividendHistory: [], // 空配列
      dpsAnnual: null,
      eps: null,
    } as any;

    cacheService.setStock('8031', incompleteStock);
    const cached = cacheService.getStock('8031');

    // キャッシュ検証ガード（jquantsApi.ts内のロジックと同等）
    const isComplete =
      cached !== null &&
      Array.isArray(cached.historicalBars) &&
      cached.historicalBars.length > 0 &&
      ((Array.isArray(cached.dividendHistory) && cached.dividendHistory.length > 0) ||
        cached.eps !== null ||
        cached.dpsAnnual !== null);

    // 空の配当履歴と空の財務データを持つ不完全キャッシュは「完全なStockData」として認めてはならない
    assert.equal(isComplete, false, 'Incomplete cache with empty dividendHistory must be rejected by complete data guard');
  });

  await t.test('preserves existing dividendHistory and financials when updating historicalBars and beta in cache', () => {
    // 正常な既存キャッシュが存在するケース
    const completeStock = {
      code: '7203',
      name: 'トヨタ自動車',
      currentPrice: 3000,
      dpsAnnual: 90,
      eps: 350,
      historicalBars: [{ Date: '2026-01-01', C: 2900 }],
      dividendHistory: [
        { periodLabel: '2025/03期', dps: 90, payoutRatio: 25, eps: 350, isForecast: false, changeAmount: 15, changePercent: 20 },
      ],
      consecutiveDividendGrowthYears: 4,
      betaAnalysis: undefined,
    } as any;

    cacheService.setStock('7203', completeStock);

    // ウォッチリスト処理による日足・ベータ値の追記更新
    const cached = cacheService.getStock('7203');
    assert.ok(cached !== null);

    const newBars = [
      { Date: '2026-01-01', C: 2900 },
      { Date: '2026-01-02', C: 3000 },
    ];
    const newBeta = {
      beta1Year: 0.75,
      category: 'defensive',
      label: 'ディフェンシブ',
      badgeEmoji: '🛡️',
    };

    // 安全な更新処理
    cached.historicalBars = newBars;
    cached.betaAnalysis = newBeta;
    cacheService.setStock('7203', cached);

    // 更新後も配当履歴・連続増配年数・財務が100%保持されていることを厳密に検証
    const reloaded = cacheService.getStock('7203');
    assert.ok(reloaded !== null);
    assert.equal(reloaded.dividendHistory.length, 1);
    assert.equal(reloaded.dividendHistory[0].dps, 90);
    assert.equal(reloaded.consecutiveDividendGrowthYears, 4);
    assert.equal(reloaded.betaAnalysis.beta1Year, 0.75);
    assert.equal(reloaded.historicalBars.length, 2);
  });
});

test('generateChartMarkers (Earnings and Dividend pin markers)', async (t) => {
  const mockBars = [
    { Date: '2026-05-01', O: 1000, H: 1050, L: 990, C: 1020, Vo: 10000 },
    // 2026-05-02 (土), 2026-05-03 (日), 2026-05-04 (月・祝), 2026-05-05 (火・祝), 2026-05-06 (水・祝) は休業日
    { Date: '2026-05-07', O: 1020, H: 1060, L: 1010, C: 1050, Vo: 15000 },
    { Date: '2026-08-03', O: 1050, H: 1080, L: 1040, C: 1070, Vo: 12000 },
    { Date: '2026-11-05', O: 1070, H: 1100, L: 1060, C: 1090, Vo: 14000 },
  ] as any;

  const mockFins = [
    {
      DiscDate: '2026-05-03', // 日曜日開示 -> 直後の営業日 2026-05-07 にスナップされるべき
      CurPerType: 'FY',
      DocType: 'FY',
    },
    {
      DiscDate: '2026-08-03', // 営業日当日
      CurPerType: '1Q',
      DocType: '1Q',
    },
  ] as any;

  const mockDividends = [
    {
      discDate: '2026-05-03', // 日曜日開示 -> 直後の営業日 2026-05-07 にスナップされるべき
      dps: 80,
      isForecast: false,
    },
    {
      discDate: '2026-11-05', // 営業日当日
      dps: 90,
      isForecast: true,
    },
  ] as any;

  await t.test('generates earnings and actual dividend markers, excluding forecast dividends from chart bars', () => {
    const markers = generateChartMarkers(mockBars, mockFins, mockDividends, {
      showEarnings: true,
      showDividends: true,
    });

    // 決算2件 (2026-05-07, 2026-08-03) + 実績配当1件 (2026-05-07) = 3件
    // 2026-11-05 の予想配当は除外される
    assert.equal(markers.length, 3);

    // time 昇順であることを検証
    for (let i = 0; i < markers.length - 1; i++) {
      assert.ok(markers[i].time <= markers[i + 1].time, `Markers must be sorted by time: ${markers[i].time} <= ${markers[i + 1].time}`);
    }

    // 2026-05-07 にスナップされた決算・配当マーカーの検証
    const markersOnMay7 = markers.filter((m) => m.time === '2026-05-07');
    assert.equal(markersOnMay7.length, 2);

    const earningsMay7 = markersOnMay7.find((m) => m.position === 'belowBar');
    assert.ok(earningsMay7 !== undefined);
    assert.equal(earningsMay7.text, 'E: 通期本決算');
    assert.equal(earningsMay7.color, '#a855f7');

    const divMay7 = markersOnMay7.find((m) => m.position === 'aboveBar');
    assert.ok(divMay7 !== undefined);
    assert.equal(divMay7.text, 'D: 80円');
    assert.equal(divMay7.color, '#f59e0b');

    // 2026-08-03 の 1Q決算マーカーの検証
    const markerAug3 = markers.find((m) => m.time === '2026-08-03');
    assert.ok(markerAug3 !== undefined);
    assert.equal(markerAug3.text, 'E: 1Q決算');

    // 予想配当マーカー(D: 90円(予))がチャート上に含まれないことを厳密に検証
    const forecastMarker = markers.find((m) => m.text.includes('(予)'));
    assert.equal(forecastMarker, undefined, 'Forecast dividends must not be pinned to past chart bars');
  });

  await t.test('respects showEarnings: false toggle option', () => {
    const markers = generateChartMarkers(mockBars, mockFins, mockDividends, {
      showEarnings: false,
      showDividends: true,
    });

    assert.equal(markers.length, 1);
    assert.ok(markers.every((m) => m.position === 'aboveBar' && m.text.startsWith('D: ')));
  });

  await t.test('respects showDividends: false toggle option', () => {
    const markers = generateChartMarkers(mockBars, mockFins, mockDividends, {
      showEarnings: true,
      showDividends: false,
    });

    assert.equal(markers.length, 2);
    assert.ok(markers.every((m) => m.position === 'belowBar' && m.text.startsWith('E: ')));
  });

  await t.test('deduplicates multiple disclosures for the same period (e.g. 8058 Mitsubishi Corp pattern)', () => {
    // 同一四半期 (2026-06-30_1Q) で 2026-08-03 と 2026-08-06 の2回開示があるケース
    const duplicatePeriodFins = [
      {
        DiscDate: '2026-08-03', // 初回決算発表日（こちらが採用されるべき）
        CurPerType: '1Q',
        CurPerEn: '2026-06-30',
        DocType: '1QFinancialStatements_Consolidated_IFRS',
      },
      {
        DiscDate: '2026-08-06', // 後日提出の四半期報告書（スキップされるべき）
        CurPerType: '1Q',
        CurPerEn: '2026-06-30',
        DocType: '1QFinancialStatements_Consolidated_IFRS',
      },
    ] as any;

    const testBars = [
      { Date: '2026-08-03', O: 1000, H: 1050, L: 990, C: 1020, Vo: 10000 },
      { Date: '2026-08-06', O: 1020, H: 1060, L: 1010, C: 1050, Vo: 15000 },
    ] as any;

    const markers = generateChartMarkers(testBars, duplicatePeriodFins, [], {
      showEarnings: true,
      showDividends: true,
    });

    // 2回開示があってもマーカーは初回（2026-08-03）の1件のみ
    assert.equal(markers.length, 1);
    assert.equal(markers[0].time, '2026-08-03');
    assert.equal(markers[0].text, 'E: 1Q決算');
  });

  await t.test('returns empty array when bars or data are empty/null', () => {
    assert.deepEqual(generateChartMarkers([], mockFins, mockDividends, { showEarnings: true, showDividends: true }), []);
    assert.deepEqual(generateChartMarkers(null as any, mockFins, mockDividends, { showEarnings: true, showDividends: true }), []);
    assert.deepEqual(generateChartMarkers(mockBars, null, null, { showEarnings: true, showDividends: true }), []);
  });
});

test('extractDividendSchedule (Dividend record months & breakdown)', async (t) => {
  await t.test('accurately extracts standard twice-a-year dividend schedule (Toyota pattern: 3/9)', () => {
    const mockFins = [
      {
        DiscDate: '2026-05-08',
        CurPerType: 'FY',
        CurFYEn: '2026-03-31',
        Div2Q: '45.0',
        DivFY: '50.0',
        DivAnn: '95.0',
        NxFDiv2Q: '50.0',
        NxFDivFY: '50.0',
        NxFDivAnn: '100.0',
      },
      {
        DiscDate: '2026-08-04',
        CurPerType: '1Q',
        CurFYEn: '2027-03-31',
        CurPerEn: '2026-06-30',
        FDiv2Q: '50.0',
        FDivFY: '50.0',
        FDivAnn: '100.0',
      },
    ] as any;

    const res = extractDividendSchedule(mockFins);
    assert.ok(res !== undefined);
    assert.equal(res.fiscalYearEndMonth, 3);
    assert.equal(res.interimMonth, 9);
    assert.equal(res.recordMonthsLabel, '3月末 / 9月末');
    assert.equal(res.frequency, 'twice');
    assert.equal(res.interimDps, 50);
    assert.equal(res.interimDpsType, 'forecast');
    assert.equal(res.yearEndDps, 50);
    assert.equal(res.yearEndDpsType, 'forecast');
    assert.equal(res.annualDps, 100);
    assert.equal(res.annualDpsType, 'forecast');
    assert.equal(res.prevInterimDps, 45);
    assert.equal(res.prevYearEndDps, 50);
    assert.equal(res.prevAnnualDps, 95);
  });

  await t.test('accurately identifies confirmed interim dividend (INPEX/JT pattern: 12/6, 2Q actual)', () => {
    const mockFins = [
      {
        DiscDate: '2026-02-12',
        CurPerType: 'FY',
        CurFYEn: '2025-12-31',
        Div2Q: '50.0',
        DivFY: '50.0',
        DivAnn: '100.0',
        NxFDiv2Q: '54.0',
        NxFDivFY: '54.0',
        NxFDivAnn: '108.0',
      },
      {
        DiscDate: '2026-08-07',
        CurPerType: '2Q',
        CurFYEn: '2026-12-31',
        CurPerEn: '2026-06-30',
        Div2Q: '56.0', // 2Q中間配当が56円で実績確定
        FDivFY: '56.0',
        FDivAnn: '112.0',
      },
    ] as any;

    const res = extractDividendSchedule(mockFins);
    assert.ok(res !== undefined);
    assert.equal(res.fiscalYearEndMonth, 12);
    assert.equal(res.interimMonth, 6);
    assert.equal(res.recordMonthsLabel, '12月末 / 6月末');
    assert.equal(res.interimDps, 56);
    assert.equal(res.interimDpsType, 'actual'); // 実績確定
    assert.equal(res.yearEndDps, 56);
    assert.equal(res.yearEndDpsType, 'forecast'); // 期末は予想
    assert.equal(res.annualDps, 112);
  });

  await t.test('handles annual-only dividend stocks properly (no interim)', () => {
    const mockFins = [
      {
        DiscDate: '2026-05-10',
        CurPerType: 'FY',
        CurFYEn: '2026-03-31',
        Div2Q: '',
        DivFY: '60.0',
        DivAnn: '60.0',
        NxFDiv2Q: '',
        NxFDivFY: '70.0',
        NxFDivAnn: '70.0',
      },
    ] as any;

    const res = extractDividendSchedule(mockFins);
    assert.ok(res !== undefined);
    assert.equal(res.fiscalYearEndMonth, 3);
    assert.equal(res.interimMonth, null);
    assert.equal(res.recordMonthsLabel, '3月末 (年1回)');
    assert.equal(res.frequency, 'annual');
    assert.equal(res.interimDps, null);
    assert.equal(res.yearEndDps, 60);
    assert.equal(res.yearEndDpsType, 'actual');
  });

  await t.test('handles undefined / empty inputs gracefully', () => {
    assert.equal(extractDividendSchedule([]), undefined);
    assert.equal(extractDividendSchedule(null as any), undefined);
  });
});

test('server shared watchlist sync logic', async (t) => {
  const { cacheService } = await import('../src/services/cacheService.ts');

  await t.test('watchlist basic CRUD operations and deduplication', () => {
    // クリーンアップ
    cacheService.clearWatchlist();
    assert.deepEqual(cacheService.getWatchlist(), []);

    // 追加
    cacheService.addToWatchlist('7203');
    cacheService.addToWatchlist(['9432', '8306', '7203 ']); // 重複と空白混じり
    assert.deepEqual(cacheService.getWatchlist(), ['7203', '9432', '8306']);

    // 個別削除
    cacheService.removeFromWatchlist('9432');
    assert.deepEqual(cacheService.getWatchlist(), ['7203', '8306']);

    // 存在チェック
    assert.equal(cacheService.isWatchlisted('7203'), true);
    assert.equal(cacheService.isWatchlisted('9432'), false);

    // クリア
    cacheService.clearWatchlist();
    assert.deepEqual(cacheService.getWatchlist(), []);
  });

  await t.test('fetchServerWatchlist graceful fallback when network fails', async () => {
    // global.fetch を一時的にモック
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const result = await cacheService.fetchServerWatchlist();
      assert.equal(result, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('fetchServerWatchlist parses server response and updates cache', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async (_url: any) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, codes: ['7203', '9432', '6758'] }),
        } as any;
      };

      const result = await cacheService.fetchServerWatchlist();
      assert.ok(result);
      assert.equal(result?.success, true);
      assert.deepEqual(result?.codes, ['7203', '9432', '6758']);
      assert.deepEqual(cacheService.getWatchlist(), ['7203', '9432', '6758']);
    } finally {
      global.fetch = originalFetch;
      cacheService.clearWatchlist();
    }
  });
});

test('Cloudflare Pages Functions onRequest (/api/watchlist)', async (t) => {
  // @ts-ignore
  const { onRequest } = await import('../functions/api/watchlist.ts');

  // モックKV
  const kvStore = new Map<string, string>();
  const mockKv = {
    async get(key: string) {
      return kvStore.get(key) || null;
    },
    async put(key: string, value: string) {
      kvStore.set(key, value);
    },
  };

  await t.test('handles OPTIONS CORS preflight', async () => {
    const req = new Request('http://localhost/api/watchlist', { method: 'OPTIONS' });
    const res = await onRequest({ request: req, env: { WATCHLIST_KV: mockKv } } as any);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  await t.test('handles GET with empty initial KV', async () => {
    const req = new Request('http://localhost/api/watchlist', { method: 'GET' });
    const res = await onRequest({ request: req, env: { WATCHLIST_KV: mockKv } } as any);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.deepEqual(json.codes, []);
  });

  await t.test('handles POST and persists unique codes', async () => {
    const req = new Request('http://localhost/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: ['7203', '9432', '7203 ', ''] }),
    });
    const res = await onRequest({ request: req, env: { WATCHLIST_KV: mockKv } } as any);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.deepEqual(json.codes, ['7203', '9432']);

    // GETで取得できるか検証
    const getReq = new Request('http://localhost/api/watchlist', { method: 'GET' });
    const getRes = await onRequest({ request: getReq, env: { WATCHLIST_KV: mockKv } } as any);
    const getJson = await getRes.json();
    assert.deepEqual(getJson.codes, ['7203', '9432']);
  });

  await t.test('handles missing KV gracefully (fallback)', async () => {
    const req = new Request('http://localhost/api/watchlist', { method: 'GET' });
    const res = await onRequest({ request: req, env: {} } as any);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.warning, 'KV_NOT_BOUND');
  });
});

import { buildCalculatedMetricsRow } from '../batch/lib/metricsCalculator.ts';

test('buildCalculatedMetricsRow (Batch metrics calculation)', async (t) => {
  await t.test('accurately calculates metrics for 1928 Sekisui House (forecast DPS 145 yen, yield 4.26%)', () => {
    const mockSekisuiFins = [
      {
        DiscDate: '2026-05-20',
        CurPerType: 'FY',
        CurFYEn: '2026-01-31',
        CurPerEn: '2026-01-31',
        Sales: '3500000000000',
        OP: '300000000000',
        NP: '200000000000',
        CFO: '350000000000',
        CFI: '-150000000000',
        ShEq: '1800000000000',
        TA: '3600000000000',
        DivAnn: '135.0',
        FDivAnn: '',
      },
      {
        DiscDate: '2026-09-10',
        CurPerType: '2Q',
        CurFYEn: '2027-01-31',
        DivAnn: '',
        FDivAnn: '145.0', // 2Q開示の最新通期予想
      },
    ];

    const currentPrice = 3403; // 株価 3,403円
    const row = buildCalculatedMetricsRow('1928', mockSekisuiFins as any, currentPrice);

    assert.equal(row.code, '1928');
    assert.equal(row.dps_annual, 145);
    assert.equal(row.dps_type, 'forecast');
    assert.equal(row.dividend_yield, 4.26); // (145 / 3403) * 100 = 4.2609... => 4.26%
    assert.equal(row.latest_fcf, 200000); // 350,000 - 150,000 = 200,000百万円 (2000億円)
    assert.equal(row.fcf_positive_count, 1);
    assert.equal(row.is_fcf_consistently_positive, 1);
    assert.equal(row.equity_ratio, 50.0); // 1.8兆 / 3.6兆 = 50%
  });
});









