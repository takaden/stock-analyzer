import type { DailyBar } from '../types/jquants';

export interface SMAPoint {
  time: string;
  value: number;
}

/**
 * 単純移動平均線 (SMA) の計算
 */
export function calculateSMA(data: DailyBar[], period: number): SMAPoint[] {
  const result: SMAPoint[] = [];
  if (!data || data.length < period) return result;

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      const price = data[i - j].AdjC || data[i - j].C;
      sum += price;
    }
    const avg = sum / period;
    result.push({
      time: data[i].Date,
      value: Math.round(avg * 10) / 10,
    });
  }

  return result;
}

/**
 * 文字列または数値を安全に number にパースする
 */
export function parseNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

import type {
  FinSummary,
  DividendHistoryItem,
  DividendSchedule,
  WatchlistFinancials,
  CashFlowPeriodItem,
  TopixBar,
  BetaAnalysis,
  MarketSensitivityCategory,
} from '../types/jquants';

/**
 * 2つの開示レコードの発行済株式数から株式分割・併合比率 (新株数 / 旧株数) を算出
 * 通常の自己株式消却や新株発行による微小変動 (0.85〜1.15) は分割なし (1) とみなす。
 * 株式分割 (例: 1:2, 1:3, 1:4, 1:5, 1:10, 1:25 等) や株式併合 (0.5, 0.2, 0.1 等) を検知。
 */
export function detectSplitRatio(latestShOut: number | null | undefined, pastShOut: number | null | undefined): number {
  if (!latestShOut || !pastShOut || latestShOut <= 0 || pastShOut <= 0) {
    return 1;
  }
  const rawRatio = latestShOut / pastShOut;
  // 1. 通常の微小変動 (0.85〜1.15) は分割なし
  if (rawRatio >= 0.85 && rawRatio <= 1.15) {
    return 1;
  }
  // 2. 株式分割 (新株数 > 旧株数, rawRatio > 1.15)
  if (rawRatio > 1.15) {
    const roundedInt = Math.round(rawRatio);
    // 整数倍との差が10%以内なら整数倍を採用 (例: 1.95〜2.05 -> 2, 2.9〜3.1 -> 3, 24〜26 -> 25)
    if (Math.abs(rawRatio - roundedInt) / roundedInt < 0.1) {
      return roundedInt;
    }
    // 1.5分割などの場合
    const roundedHalf = Math.round(rawRatio * 2) / 2;
    if (Math.abs(rawRatio - roundedHalf) / roundedHalf < 0.1) {
      return roundedHalf;
    }
    return rawRatio;
  }
  // 3. 株式併合 (新株数 < 旧株数, rawRatio < 0.85)
  const inv = 1 / rawRatio;
  const roundedInv = Math.round(inv);
  if (Math.abs(inv - roundedInv) / roundedInv < 0.1) {
    return 1 / roundedInv;
  }
  const roundedInvHalf = Math.round(inv * 2) / 2;
  if (Math.abs(inv - roundedInvHalf) / roundedInvHalf < 0.1) {
    return 1 / roundedInvHalf;
  }
  return rawRatio;
}

/**
 * 決算サマリーから過去の年間配当推移と連続増配年数を抽出
 * (株式分割があった場合は過去のDPSおよびEPSを現在の株式数基準にスプリット調整)
 */
export function extractDividendHistory(fins: FinSummary[]): {
  history: DividendHistoryItem[];
  streak: number;
} {
  if (!fins || fins.length === 0) {
    return { history: [], streak: 0 };
  }

  // 開示日昇順にソート
  const sortedFins = [...fins].sort((a, b) => a.DiscDate.localeCompare(b.DiscDate));
  const latestFin = sortedFins[sortedFins.length - 1];
  const latestShOut = parseNumber(latestFin.ShOutFY);

  // FY (本決算) レコードを期末日(CurPerEn)ごとに抽出 (重複は新しい開示を採用)
  const fyMap = new Map<string, FinSummary>();
  sortedFins.forEach((f) => {
    if (f.CurPerType === 'FY' && f.CurPerEn) {
      fyMap.set(f.CurPerEn, f);
    }
  });

  const sortedFys = Array.from(fyMap.values()).sort((a, b) => (a.CurPerEn || '').localeCompare(b.CurPerEn || ''));
  const history: DividendHistoryItem[] = [];

  sortedFys.forEach((fy) => {
    const rawDps = parseNumber(fy.DivAnn) ?? parseNumber(fy.DivFY);
    if (rawDps !== null && rawDps > 0 && fy.CurPerEn) {
      const year = fy.CurPerEn.slice(0, 4);
      const month = fy.CurPerEn.slice(5, 7);
      const rawPayout = parseNumber(fy.PayoutRatioAnn);
      const rawEps = parseNumber(fy.EPS);

      // 株式分割・併合調整 (過去実績を現在の株式数基準に換算)
      const fyShOut = parseNumber(fy.ShOutFY);
      const splitRatio = detectSplitRatio(latestShOut, fyShOut);
      const dps = splitRatio !== 1 ? Math.round((rawDps / splitRatio) * 10) / 10 : rawDps;
      const eps = rawEps !== null && splitRatio !== 1 ? Math.round((rawEps / splitRatio) * 100) / 100 : rawEps;

      history.push({
        periodLabel: `${year}/${month}期`,
        discDate: fy.DiscDate,
        dps,
        payoutRatio: rawPayout !== null ? (rawPayout <= 1 ? Math.round(rawPayout * 1000) / 10 : rawPayout) : null,
        eps,
        isForecast: false,
        changeAmount: null,
        changePercent: null,
      });
    }
  });

  // 最新の開示から進行期（来期予想）配当を取得
  const lastFY = sortedFys[sortedFys.length - 1];
  const latestDpsInfo = extractLatestDps(fins);
  const forecastDps =
    (latestDpsInfo.dpsType === 'forecast' ? latestDpsInfo.dpsAnnual : null) ??
    (lastFY ? parseNumber(lastFY.NxFDivAnn) : null);

  if (forecastDps !== null && forecastDps > 0) {
    let nextLabel = '進行期(予)';
    if (lastFY && lastFY.NxtFYEn) {
      nextLabel = `${lastFY.NxtFYEn.slice(0, 4)}/${lastFY.NxtFYEn.slice(5, 7)}期(予)`;
    } else if (lastFY && lastFY.CurPerEn) {
      const nextYear = parseInt(lastFY.CurPerEn.slice(0, 4), 10) + 1;
      nextLabel = `${nextYear}/${lastFY.CurPerEn.slice(5, 7)}期(予)`;
    }

    const rawPayout = parseNumber(latestFin.FPayoutRatioAnn) ?? (lastFY ? parseNumber(lastFY.NxFPayoutRatioAnn) : null);
    history.push({
      periodLabel: nextLabel,
      discDate: latestFin.DiscDate,
      dps: forecastDps,
      payoutRatio: rawPayout !== null ? (rawPayout <= 1 ? Math.round(rawPayout * 1000) / 10 : rawPayout) : null,
      eps: parseNumber(latestFin.FEPS) ?? (lastFY ? parseNumber(lastFY.NxFEPS) : null),
      isForecast: true,
      changeAmount: null,
      changePercent: null,
    });
  }

  // 前期比増減額・増減率の計算
  for (let i = 0; i < history.length; i++) {
    if (i > 0) {
      const prev = history[i - 1];
      const diff = Math.round((history[i].dps - prev.dps) * 10) / 10;
      history[i].changeAmount = diff;
      history[i].changePercent = prev.dps > 0 ? Math.round((diff / prev.dps) * 1000) / 10 : null;
    }
  }

  // 連続増配年数の算出 (最新期から過去に遡る)
  let streak = 0;
  for (let i = history.length - 1; i >= 1; i--) {
    if (history[i].changeAmount != null && history[i].changeAmount! > 0) {
      streak++;
    } else {
      break;
    }
  }

  return { history, streak };
}

/**
 * 決算サマリーから配当権利確定月および中間・期末の配当金内訳を抽出
 */
export function extractDividendSchedule(fins: FinSummary[]): DividendSchedule | undefined {
  if (!fins || fins.length === 0) return undefined;

  // 開示日昇順
  const sortedFins = [...fins].sort((a, b) => a.DiscDate.localeCompare(b.DiscDate));
  const latestFin = sortedFins[sortedFins.length - 1];
  const fys = sortedFins.filter((f) => f.CurPerType === 'FY');
  const lastFY = fys[fys.length - 1];

  // 1. 決算期末日・決算月
  const curFYEn = latestFin.CurFYEn || lastFY?.CurFYEn;
  if (!curFYEn) return undefined;
  const fiscalYearEndMonth = parseInt(curFYEn.slice(5, 7), 10);
  if (isNaN(fiscalYearEndMonth) || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
    return undefined;
  }

  // 2. 中間配当月 (2QレコードのCurPerEn または 決算月より6ヶ月前/後)
  const q2Record = sortedFins.find((f) => f.CurPerType === '2Q' && f.CurPerEn);
  const calculatedInterim = ((fiscalYearEndMonth + 6 - 1) % 12) + 1;
  const interimMonth =
    q2Record && q2Record.CurPerEn ? parseInt(q2Record.CurPerEn.slice(5, 7), 10) : calculatedInterim;

  // 3. 四半期配当チェック (1Qや3Qに実績配当があるか)
  const hasQuarterly = sortedFins.some(
    (f) => (parseNumber(f.Div1Q) || 0) > 0 || (parseNumber(f.Div3Q) || 0) > 0
  );

  // 4. 中間配当金額・種別の抽出
  let interimDps: number | null = null;
  let interimDpsType: 'forecast' | 'actual' | null = null;
  const actQ2 = parseNumber(latestFin.Div2Q);
  const fQ2 = parseNumber(latestFin.FDiv2Q) ?? (lastFY ? parseNumber(lastFY.NxFDiv2Q) : null);

  if (actQ2 !== null && actQ2 > 0) {
    interimDps = actQ2;
    interimDpsType = 'actual';
  } else if (fQ2 !== null && fQ2 > 0) {
    interimDps = fQ2;
    interimDpsType = 'forecast';
  }

  // 5. 期末配当金額・種別の抽出
  let yearEndDps: number | null = null;
  let yearEndDpsType: 'forecast' | 'actual' | null = null;
  const actFY = latestFin.CurPerType === 'FY' ? parseNumber(latestFin.DivFY) : null;
  const fFY = parseNumber(latestFin.FDivFY) ?? (lastFY ? parseNumber(lastFY.NxFDivFY) : null);

  if (actFY !== null && actFY > 0) {
    yearEndDps = actFY;
    yearEndDpsType = 'actual';
  } else if (fFY !== null && fFY > 0) {
    yearEndDps = fFY;
    yearEndDpsType = 'forecast';
  }

  // 6. 株式分割調整 (期中分割時の中間配当の分割後換算)
  const latestShOut = parseNumber(latestFin.ShOutFY);
  const prevFinWithShOut = sortedFins.slice(0, -1).reverse().find((f) => parseNumber(f.ShOutFY));
  const prevShOut = prevFinWithShOut ? parseNumber(prevFinWithShOut.ShOutFY) : null;
  let splitRatio = detectSplitRatio(latestShOut, prevShOut);

  if (splitRatio === 1 && interimDps && yearEndDps && interimDps >= yearEndDps * 1.8 && interimDps <= yearEndDps * 2.2) {
    splitRatio = 2;
  }
  if (splitRatio > 1.15 && interimDps !== null) {
    // 中間配当を分割後（期末新基準）に換算
    interimDps = Math.round((interimDps / splitRatio) * 100) / 100;
  }

  // 7. 年間合計
  const latestDpsInfo = extractLatestDps(fins);
  const annualDps = latestDpsInfo.dpsAnnual ?? parseNumber(latestFin.FDivAnn) ?? (lastFY ? parseNumber(lastFY.NxFDivAnn) : null);
  const annualDpsType = latestDpsInfo.dpsType ?? (latestFin.FDivAnn ? 'forecast' : null);

  // 8. 中間配当の有無判定
  const prevActQ2 = lastFY ? parseNumber(lastFY.Div2Q) : null;
  const hasInterim =
    (interimDps !== null && interimDps > 0) || (prevActQ2 !== null && prevActQ2 > 0);

  // 9. 頻度と表示ラベル
  let frequency: 'twice' | 'annual' | 'quarterly' | 'other' = 'twice';
  let recordMonthsLabel = `${fiscalYearEndMonth}月末 / ${interimMonth}月末`;

  if (hasQuarterly) {
    frequency = 'quarterly';
    recordMonthsLabel = `3ヶ月ごと (四半期配当)`;
  } else if (!hasInterim) {
    frequency = 'annual';
    recordMonthsLabel = `${fiscalYearEndMonth}月末 (年1回)`;
  }

  // 前期実績の内訳（株式分割調整済み）
  const lastFYShOut = lastFY ? parseNumber(lastFY.ShOutFY) : null;
  const prevSplitRatio = detectSplitRatio(latestShOut, lastFYShOut);
  const prevInterimDps = prevActQ2 !== null ? (prevSplitRatio !== 1 ? Math.round((prevActQ2 / prevSplitRatio) * 100) / 100 : prevActQ2) : null;
  const rawPrevYearEnd = lastFY ? parseNumber(lastFY.DivFY) : null;
  const prevYearEndDps = rawPrevYearEnd !== null ? (prevSplitRatio !== 1 ? Math.round((rawPrevYearEnd / prevSplitRatio) * 100) / 100 : rawPrevYearEnd) : null;
  const rawPrevAnnual = lastFY ? parseNumber(lastFY.DivAnn) : null;
  const prevAnnualDps = rawPrevAnnual !== null ? (prevSplitRatio !== 1 ? Math.round((rawPrevAnnual / prevSplitRatio) * 100) / 100 : rawPrevAnnual) : null;

  return {
    fiscalYearEndMonth,
    interimMonth: hasInterim ? interimMonth : null,
    recordMonthsLabel,
    frequency,
    interimDps,
    interimDpsType,
    yearEndDps,
    yearEndDpsType,
    annualDps,
    annualDpsType,
    prevInterimDps,
    prevYearEndDps,
    prevAnnualDps,
  };
}

/**
 * 決算サマリーから最新の年間配当予想または実績配当を抽出
 * (開示日の新しい順に走査し、期中株式分割や内訳からの再構成、分割調整を行って取得)
 */
export function extractLatestDps(fins: FinSummary[]): {
  dpsAnnual: number | null;
  dpsType: 'forecast' | 'actual' | null;
} {
  if (!fins || fins.length === 0) {
    return { dpsAnnual: null, dpsType: null };
  }

  // 開示日降順（最新開示が先頭）
  const sorted = [...fins].sort((a, b) => (b.DiscDate || '').localeCompare(a.DiscDate || ''));
  const latestFin = sorted[0];
  const latestShOut = parseNumber(latestFin.ShOutFY);

  // 1. 最新開示そのものに会社予想年間配当 FDivAnn または本決算時の来期予想 NxFDivAnn があるか
  const latestFdiv = parseNumber(latestFin.FDivAnn) ?? (latestFin.CurPerType === 'FY' ? parseNumber(latestFin.NxFDivAnn) : null);
  if (latestFdiv !== null && latestFdiv > 0) {
    return { dpsAnnual: latestFdiv, dpsType: 'forecast' };
  }

  // 2. 最新開示で FDivAnn が空欄だが、期末予想 (FDivFY) が存在する場合の年間予想再構成
  // (例: 花王のように期中株式分割により中間と期末で株式数が異なり、企業が FDivAnn を空欄開示しているケース)
  const fFY = parseNumber(latestFin.FDivFY);
  const actQ2 = parseNumber(latestFin.Div2Q);
  const fQ2 = parseNumber(latestFin.FDiv2Q);
  const midDps = actQ2 ?? fQ2;

  if (fFY !== null && fFY > 0) {
    if (midDps !== null && midDps > 0) {
      // 中間配当と期末予想の両方が存在
      // 期中株式分割判定:
      // (a) 最新開示と過去開示（前期FYなど）の株式数を比較
      const prevFinWithShOut = sorted.slice(1).find((f) => parseNumber(f.ShOutFY));
      const prevShOut = prevFinWithShOut ? parseNumber(prevFinWithShOut.ShOutFY) : null;
      let splitRatio = detectSplitRatio(latestShOut, prevShOut);

      // (b) 株式数情報がない場合でも、中間が期末のほぼ2倍等で期末が明らかに分割後になっている場合
      if (splitRatio === 1 && midDps >= fFY * 1.8 && midDps <= fFY * 2.2) {
        splitRatio = 2;
      }

      let adjustedMidDps = midDps;
      if (splitRatio > 1.15) {
        // 中間配当は分割前基準なので、新株式数基準（期末基準）に換算
        adjustedMidDps = Math.round((midDps / splitRatio) * 100) / 100;
      }
      const combinedDps = Math.round((adjustedMidDps + fFY) * 100) / 100;
      return { dpsAnnual: combinedDps, dpsType: 'forecast' };
    } else {
      // 中間がなく期末予想のみの場合 (年1回配当など)
      return { dpsAnnual: fFY, dpsType: 'forecast' };
    }
  }

  // 3. 同一会計年度 (CurFYEn) の他の開示に FDivAnn があるか
  for (const fin of sorted) {
    if (fin.CurFYEn && fin.CurFYEn === latestFin.CurFYEn) {
      const fdiv = parseNumber(fin.FDivAnn);
      if (fdiv !== null && fdiv > 0) {
        const finShOut = parseNumber(fin.ShOutFY);
        const splitRatio = detectSplitRatio(latestShOut, finShOut);
        const adjustedFdiv = splitRatio !== 1 ? Math.round((fdiv / splitRatio) * 100) / 100 : fdiv;
        return { dpsAnnual: adjustedFdiv, dpsType: 'forecast' };
      }
    }
  }

  // 4. 会社予想が取得できない場合、確定実績年間配当 DivAnn を探索 (株式分割調整付き)
  for (const fin of sorted) {
    const div = parseNumber(fin.DivAnn);
    if (div !== null && div > 0) {
      const finShOut = parseNumber(fin.ShOutFY);
      const splitRatio = detectSplitRatio(latestShOut, finShOut);
      const adjustedDiv = splitRatio !== 1 ? Math.round((div / splitRatio) * 100) / 100 : div;
      return { dpsAnnual: adjustedDiv, dpsType: 'actual' };
    }
  }

  return { dpsAnnual: null, dpsType: null };
}

/**
 * 決算サマリーから最新の年間1株当たり利益 (EPS) を抽出
 * (通期会社予想 FEPS を最優先とし、未発表の場合は最新本決算 FY の確定 EPS を使用。四半期累計 EPS は除外)
 */
export function extractAnnualEps(fins: FinSummary[]): {
  eps: number | null;
  epsType: 'forecast' | 'actual' | null;
} {
  if (!fins || fins.length === 0) {
    return { eps: null, epsType: null };
  }

  // 開示日降順（最新開示が先頭）
  const sorted = [...fins].sort((a, b) => (b.DiscDate || '').localeCompare(a.DiscDate || ''));

  // 1. 最新の開示から順に通期会社予想 FEPS を探索
  for (const fin of sorted) {
    const feps = parseNumber(fin.FEPS);
    if (feps !== null && feps > 0) {
      return { eps: feps, epsType: 'forecast' };
    }
  }

  // 2. 通期予想がない場合、本決算 (CurPerType === 'FY') の確定 EPS を探索
  for (const fin of sorted) {
    if (fin.CurPerType === 'FY') {
      const actEps = parseNumber(fin.EPS);
      if (actEps !== null && actEps > 0) {
        return { eps: actEps, epsType: 'actual' };
      }
    }
  }

  return { eps: null, epsType: null };
}

/**
 * 決算サマリーから ROE (%) を算出
 * (最新本決算の当期純利益 NP と株主資本 ShEq/Eq から算出)
 */
export function calculateRoeFromFins(fins: FinSummary[]): number | null {
  if (!fins || fins.length === 0) return null;

  // 開示日昇順
  const sorted = [...fins].sort((a, b) => (a.DiscDate || '').localeCompare(b.DiscDate || ''));
  const fys = sorted.filter((f) => f.CurPerType === 'FY');
  const latestFY = fys.length > 0 ? fys[fys.length - 1] : null;

  if (!latestFY) return null;

  const np = parseNumber(latestFY.NP);
  const shEq = parseNumber(latestFY.ShEq) ?? parseNumber(latestFY.Eq);

  if (np !== null && shEq !== null && shEq > 0) {
    const roe = (np / shEq) * 100;
    return Math.round(roe * 10) / 10;
  }

  return null;
}

/**
 * 決算サマリーからウォッチリスト比較用の詳細財務指標 (持続力・還元方針・事業基盤) を算出
 */
export function calculateWatchlistFinancials(
  fins: FinSummary[],
  currentPrice: number,
  fallbackDpsAnnual: number | null = null
): WatchlistFinancials | null {
  if (!fins || fins.length === 0) {
    return null;
  }

  // 開示日昇順にソート
  const sortedFins = [...fins].sort((a, b) => a.DiscDate.localeCompare(b.DiscDate));
  const latestFin = sortedFins[sortedFins.length - 1];

  // 公式開示から最新の年間配当金 (会社予想優先) を抽出
  const { dpsAnnual: officialDps, dpsType } = extractLatestDps(fins);
  const effectiveDps = officialDps ?? fallbackDpsAnnual ?? null;
  const dividendYield =
    effectiveDps !== null && currentPrice > 0 ? (effectiveDps / currentPrice) * 100 : null;

  // FY (本決算) レコードを期末日(CurPerEn)ごとに抽出 (重複は新しい開示を採用)
  const fyMap = new Map<string, FinSummary>();
  sortedFins.forEach((f) => {
    if (f.CurPerType === 'FY' && f.CurPerEn) {
      fyMap.set(f.CurPerEn, f);
    }
  });

  const sortedFys = Array.from(fyMap.values()).sort((a, b) => (a.CurPerEn || '').localeCompare(b.CurPerEn || ''));
  const latestFY = sortedFys.length > 0 ? sortedFys[sortedFys.length - 1] : null;

  // ----------------------------------------------------
  // 1. 持続力 (Sustainability)
  // ----------------------------------------------------
  // FCF = CFO + CFI (百万円単位)
  let latestCfo: number | null = null;
  let latestCfi: number | null = null;
  let latestFcf: number | null = null;
  let fcfPositiveCount = 0;
  let fcfValidCount = 0;
  const cfHistory: CashFlowPeriodItem[] = [];

  sortedFys.forEach((fy) => {
    const rawCfo = parseNumber(fy.CFO);
    const rawCfi = parseNumber(fy.CFI);
    const cfoMillion = rawCfo !== null ? Math.round(rawCfo / 1_000_000) : null;
    const cfiMillion = rawCfi !== null ? Math.round(rawCfi / 1_000_000) : null;
    let fcfMillion: number | null = null;

    if (rawCfo !== null && rawCfi !== null) {
      fcfMillion = Math.round((rawCfo + rawCfi) / 1_000_000);
      fcfValidCount++;
      if (fcfMillion > 0) fcfPositiveCount++;
    }

    if (fy.CurPerEn) {
      const year = fy.CurPerEn.slice(0, 4);
      const month = fy.CurPerEn.slice(5, 7);
      cfHistory.push({
        periodLabel: `${year}/${month}期`,
        curPerEn: fy.CurPerEn,
        cfo: cfoMillion,
        cfi: cfiMillion,
        fcf: fcfMillion,
      });
    }
  });

  if (latestFY) {
    const rawCfo = parseNumber(latestFY.CFO);
    const rawCfi = parseNumber(latestFY.CFI);
    if (rawCfo !== null) latestCfo = Math.round(rawCfo / 1_000_000);
    if (rawCfi !== null) latestCfi = Math.round(rawCfi / 1_000_000);
    if (rawCfo !== null && rawCfi !== null) {
      latestFcf = Math.round((rawCfo + rawCfi) / 1_000_000);
    }
  }

  // 恒常的プラス判定: 複数期あり、過半数がプラスかつ直近期もプラス
  const isFcfConsistentlyPositive =
    fcfValidCount > 0 &&
    latestFcf !== null &&
    latestFcf > 0 &&
    fcfPositiveCount >= Math.ceil(fcfValidCount * 0.6);

  // 配当履歴 (非減配年数 & 連続増配)
  const { history: divHist, streak } = extractDividendHistory(fins);
  const actualDivs = divHist.filter((h) => !h.isForecast);
  let nonReductionYears = 0;
  let isNoDividendCut5Years = true;

  if (actualDivs.length >= 2) {
    for (let i = actualDivs.length - 1; i >= 1; i--) {
      const curr = actualDivs[i].dps;
      const prev = actualDivs[i - 1].dps;
      if (curr >= prev) {
        nonReductionYears++;
      } else {
        isNoDividendCut5Years = false;
        break;
      }
    }
    // 過去5期で減配が一度もないかチェック
    for (let i = 1; i < actualDivs.length; i++) {
      if (actualDivs[i].dps < actualDivs[i - 1].dps) {
        isNoDividendCut5Years = false;
        break;
      }
    }
  } else if (actualDivs.length === 1) {
    nonReductionYears = 1;
    isNoDividendCut5Years = true;
  }

  // 自己資本比率 (%)
  let rawEqAR = parseNumber(latestFin.EqAR) ?? (latestFY ? parseNumber(latestFY.EqAR) : null);
  if (rawEqAR === null && latestFY) {
    const shEq = parseNumber(latestFY.ShEq) ?? parseNumber(latestFY.Eq);
    const ta = parseNumber(latestFY.TA);
    if (shEq !== null && ta !== null && ta > 0) {
      rawEqAR = shEq / ta;
    }
  }
  const equityRatio = rawEqAR !== null ? Math.round((rawEqAR <= 1 ? rawEqAR * 100 : rawEqAR) * 10) / 10 : null;
  const isEquityRatioSafe = equityRatio !== null && equityRatio >= 40.0;
  const isEquityRatioSolid = equityRatio !== null && equityRatio >= 60.0;

  // 自己資本・内部留保の推移
  let equityGrowthTrend: 'growing' | 'stable' | 'decreasing' | 'unknown' = 'unknown';
  let equity5YearChangePercent: number | null = null;
  const eqList = sortedFys
    .map((fy) => parseNumber(fy.ShEq) ?? parseNumber(fy.Eq))
    .filter((v): v is number => v !== null && v > 0);

  if (eqList.length >= 2) {
    const firstEq = eqList[0];
    const lastEq = eqList[eqList.length - 1];
    equity5YearChangePercent = Math.round(((lastEq - firstEq) / firstEq) * 1000) / 10;
    if (lastEq > firstEq * 1.05) {
      equityGrowthTrend = 'growing';
    } else if (lastEq < firstEq * 0.95) {
      equityGrowthTrend = 'decreasing';
    } else {
      equityGrowthTrend = 'stable';
    }
  }

  // ----------------------------------------------------
  // 2. 還元方針 (Shareholder Return)
  // ----------------------------------------------------
  // 配当性向 (%)
  let rawPayout =
    parseNumber(latestFin.FPayoutRatioAnn) ??
    parseNumber(latestFin.PayoutRatioAnn) ??
    (latestFY ? parseNumber(latestFY.PayoutRatioAnn) : null);

  if (rawPayout === null && effectiveDps !== null) {
    const epsVal = parseNumber(latestFin.FEPS) ?? parseNumber(latestFin.EPS) ?? (latestFY ? parseNumber(latestFY.EPS) : null);
    if (epsVal !== null && epsVal > 0) {
      rawPayout = (effectiveDps / epsVal) * 100;
    }
  }

  let payoutRatio: number | null = null;
  let payoutRatioStatus: 'healthy' | 'acceptable' | 'warning' | 'danger' | 'unknown' = 'unknown';

  if (rawPayout !== null) {
    payoutRatio = Math.round((rawPayout <= 1 ? rawPayout * 100 : rawPayout) * 10) / 10;
    if (payoutRatio <= 0 || payoutRatio > 100) {
      payoutRatioStatus = 'danger';
    } else if (payoutRatio > 70) {
      payoutRatioStatus = 'warning';
    } else if (payoutRatio >= 30 && payoutRatio <= 50) {
      payoutRatioStatus = 'healthy';
    } else {
      payoutRatioStatus = 'acceptable';
    }
  }

  // DOE (自己資本配当率) (%) = (1株配当金 / BPS) * 100
  let doe: number | null = null;
  const bpsVal = parseNumber(latestFin.BPS) ?? (latestFY ? parseNumber(latestFY.BPS) : null);
  const targetDps = effectiveDps ?? (latestFY ? parseNumber(latestFY.DivAnn) : null);

  if (targetDps !== null && bpsVal !== null && bpsVal > 0) {
    doe = Math.round((targetDps / bpsVal) * 1000) / 10;
  } else if (latestFY) {
    const divTotal = parseNumber(latestFY.DivTotalAnn);
    const shEq = parseNumber(latestFY.ShEq) ?? parseNumber(latestFY.Eq);
    if (divTotal !== null && shEq !== null && shEq > 0) {
      doe = Math.round((divTotal / shEq) * 1000) / 10;
    }
  }

  const isDoeHigh = doe !== null && doe >= 2.5;
  const isDoeTopTier = doe !== null && doe >= 3.5;

  // 自社株買い検知 (自己株式数 TrShFY の増加)
  let buybackDetected = false;
  if (sortedFys.length >= 2) {
    const prevTrSh = parseNumber(sortedFys[sortedFys.length - 2].TrShFY);
    const currTrSh = parseNumber(sortedFys[sortedFys.length - 1].TrShFY);
    if (prevTrSh !== null && currTrSh !== null && currTrSh > prevTrSh) {
      buybackDetected = true;
    }
  }

  // ----------------------------------------------------
  // 3. 事業基盤 (Business Fundamentals)
  // ----------------------------------------------------
  // 営業利益率 (%) = (OP / Sales) * 100
  let opMargin: number | null = null;
  const targetFYForMargin = latestFY || latestFin;
  const op = parseNumber(targetFYForMargin.OP) ?? parseNumber(targetFYForMargin.FOP);
  const sales = parseNumber(targetFYForMargin.Sales) ?? parseNumber(targetFYForMargin.FSales);

  if (op !== null && sales !== null && sales > 0) {
    opMargin = Math.round((op / sales) * 1000) / 10;
  }
  const isOpMarginHigh = opMargin !== null && opMargin >= 8.0;
  const isOpMarginTopTier = opMargin !== null && opMargin >= 10.0;

  // ROE (%)
  const roe = calculateRoeFromFins(fins);
  const isRoeGood = roe !== null && roe >= 8.0;

  // ROA (%) = (当期純利益 NP / 総資産 TA) * 100
  let roa: number | null = null;
  if (latestFY) {
    const np = parseNumber(latestFY.NP);
    const ta = parseNumber(latestFY.TA);
    if (np !== null && ta !== null && ta > 0) {
      roa = Math.round((np / ta) * 1000) / 10;
    }
  }
  const isRoaGood = roa !== null && roa >= 5.0;

  // EPS中長期成長性 (5年年平均成長率 CAGR %)
  let eps5YearCagr: number | null = null;
  let epsTrend: 'growing' | 'stable' | 'decreasing' | 'unknown' = 'unknown';
  const epsList = sortedFys
    .map((fy) => parseNumber(fy.EPS))
    .filter((v): v is number => v !== null);

  if (epsList.length >= 2) {
    const firstEps = epsList[0];
    const lastEps = epsList[epsList.length - 1];
    const years = epsList.length - 1;

    if (firstEps > 0 && lastEps > 0 && years > 0) {
      const cagr = (Math.pow(lastEps / firstEps, 1 / years) - 1) * 100;
      eps5YearCagr = Math.round(cagr * 10) / 10;
    }

    if (lastEps > firstEps * 1.1) {
      epsTrend = 'growing';
    } else if (lastEps < firstEps * 0.9) {
      epsTrend = 'decreasing';
    } else {
      epsTrend = 'stable';
    }
  }

  // ----------------------------------------------------
  // 総合適合スコアの集計 (全10項目)
  // ----------------------------------------------------
  let scorePassed = 0;
  let scoreTotal = 10;

  if (isFcfConsistentlyPositive) scorePassed++;
  if (isNoDividendCut5Years || nonReductionYears >= 3) scorePassed++;
  if (isEquityRatioSafe) scorePassed++;
  if (equityGrowthTrend === 'growing') scorePassed++;
  if (payoutRatioStatus === 'healthy' || payoutRatioStatus === 'acceptable') scorePassed++;
  if (isDoeHigh) scorePassed++;
  if (isOpMarginHigh) scorePassed++;
  if (isRoeGood) scorePassed++;
  if (isRoaGood) scorePassed++;
  if (epsTrend === 'growing') scorePassed++;

  return {
    dpsAnnual: effectiveDps,
    dpsType,
    dividendYield,
    latestCfo,
    latestCfi,
    latestFcf,
    cfHistory,
    fcfPositiveCount,
    fcfTotalCount: fcfValidCount,
    isFcfConsistentlyPositive,
    nonReductionYears,
    consecutiveDividendGrowthYears: streak,
    isNoDividendCut5Years,
    equityRatio,
    isEquityRatioSafe,
    isEquityRatioSolid,
    equityGrowthTrend,
    equity5YearChangePercent,
    payoutRatio,
    payoutRatioStatus,
    doe,
    isDoeHigh,
    isDoeTopTier,
    buybackDetected,
    opMargin,
    isOpMarginHigh,
    isOpMarginTopTier,
    roe,
    isRoeGood,
    roa,
    isRoaGood,
    eps5YearCagr,
    epsTrend,
    scorePassed,
    scoreTotal,
  };
}

/**
 * ベータ値（β）および市場感応度（景気敏感 / ディフェンシブ）の計算
 *
 * β = Cov(R_stock, R_topix) / Var(R_topix)
 *
 * @param stockBars 個別銘柄の日足データ (AdjC または C を使用)
 * @param topixBars TOPIXの日足データ
 * @returns BetaAnalysis (1年・3年・5年ベータ、相関係数、判定カテゴリ、ラベル、解説)
 */
export function calculateBeta(
  stockBars: DailyBar[],
  topixBars: TopixBar[]
): BetaAnalysis | undefined {
  if (!stockBars || stockBars.length < 20 || !topixBars || topixBars.length < 20) {
    return undefined;
  }

  // TOPIX の日付 -> 終値 マップを高速参照用に作成
  const topixMap = new Map<string, number>();
  for (const tb of topixBars) {
    if (tb.Date && typeof tb.C === 'number' && tb.C > 0) {
      topixMap.set(tb.Date, tb.C);
    }
  }

  // 日付昇順にソート (古い順)
  const sortedStock = [...stockBars].sort((a, b) => a.Date.localeCompare(b.Date));

  // 日次リターンのペアを作成
  const pairs: { stockReturn: number; marketReturn: number }[] = [];

  for (let i = 1; i < sortedStock.length; i++) {
    const prev = sortedStock[i - 1];
    const curr = sortedStock[i];

    const prevPrice = prev.AdjC || prev.C;
    const currPrice = curr.AdjC || curr.C;

    const mPrev = topixMap.get(prev.Date);
    const mCurr = topixMap.get(curr.Date);

    if (
      typeof prevPrice === 'number' &&
      prevPrice > 0 &&
      typeof currPrice === 'number' &&
      currPrice > 0 &&
      typeof mPrev === 'number' &&
      mPrev > 0 &&
      typeof mCurr === 'number' &&
      mCurr > 0
    ) {
      const stockReturn = (currPrice - prevPrice) / prevPrice;
      const marketReturn = (mCurr - mPrev) / mPrev;
      pairs.push({ stockReturn, marketReturn });
    }
  }

  if (pairs.length < 20) {
    return undefined;
  }

  // 補助計算関数 (共分散・分散・相関係数)
  const computeCovAndVar = (slicePairs: { stockReturn: number; marketReturn: number }[]) => {
    const n = slicePairs.length;
    if (n < 20) return { beta: null, correlation: null };

    const meanS = slicePairs.reduce((sum, p) => sum + p.stockReturn, 0) / n;
    const meanM = slicePairs.reduce((sum, p) => sum + p.marketReturn, 0) / n;

    let cov = 0;
    let varM = 0;
    let varS = 0;

    for (let i = 0; i < n; i++) {
      const diffS = slicePairs[i].stockReturn - meanS;
      const diffM = slicePairs[i].marketReturn - meanM;
      cov += diffS * diffM;
      varM += diffM * diffM;
      varS += diffS * diffS;
    }

    if (varM <= 0) return { beta: null, correlation: null };

    const beta = Math.round((cov / varM) * 100) / 100;
    const denom = Math.sqrt(varS * varM);
    const correlation = denom > 0 ? Math.round((cov / denom) * 100) / 100 : null;

    return { beta, correlation };
  };

  // 1年 (約250営業日), 3年 (約750営業日), 5年 (全期間)
  const stats1Year = computeCovAndVar(pairs.slice(-250));
  const stats3Year = computeCovAndVar(pairs.slice(-750));
  const stats5Year = computeCovAndVar(pairs);

  const primaryBeta = stats1Year.beta ?? stats3Year.beta ?? stats5Year.beta;

  if (primaryBeta === null) {
    return undefined;
  }

  // 判定基準
  let category: MarketSensitivityCategory = 'neutral';
  let label = '市場連動';
  let badgeEmoji = '⚖️';
  let description = '';

  if (primaryBeta < 0.8) {
    category = 'defensive';
    label = 'ディフェンシブ';
    badgeEmoji = '🛡️';
    description =
      '市場（TOPIX）の変動に影響されにくく、景気後退や相場急落時にも値崩れしにくいディフェンシブ銘柄です。守りの資産や安定配当狙いに適しています。';
  } else if (primaryBeta > 1.2) {
    category = 'cyclical';
    label = '景気敏感';
    badgeEmoji = '🚀';
    description =
      '市場全体の上げ下げに対する感応度が高く、上昇局面でアウトパフォームしやすい反面、下落局面の下げ幅も大きいハイボラティリティな景気敏感銘柄です。';
  } else {
    category = 'neutral';
    label = '市場連動';
    badgeEmoji = '⚖️';
    description =
      '市場平均（TOPIX）とおおむね同等のペースで連動して推移するバランス型の銘柄です。';
  }

  return {
    beta1Year: stats1Year.beta,
    beta3Year: stats3Year.beta,
    beta5Year: stats5Year.beta,
    correlation: stats1Year.correlation ?? stats3Year.correlation ?? stats5Year.correlation,
    category,
    label,
    badgeEmoji,
    description,
    dataDays: pairs.length,
  };
}

export interface ChartEventMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle';
  text: string;
  id?: string;
  size?: number;
}

/**
 * 決算発表日 (E) および 配当金情報 (D) のチャートマーカー（TradingView風）を生成
 */
export function generateChartMarkers(
  bars: DailyBar[],
  fins: FinSummary[] | null | undefined,
  dividendHistory: DividendHistoryItem[] | null | undefined,
  options: { showEarnings: boolean; showDividends: boolean }
): ChartEventMarker[] {
  if (!bars || bars.length === 0) return [];

  const markers: ChartEventMarker[] = [];
  const barDates = bars.map((b) => b.Date);
  const minDate = barDates[0];
  const maxDate = barDates[barDates.length - 1];

  // 日付を直後の有効な営業日にスナップする関数 (土日祝や取引終了後の開示に対応)
  const snapToNextTradingDay = (targetDate: string): string | null => {
    if (!targetDate || targetDate < minDate) return null;
    if (targetDate > maxDate) return null;

    let low = 0;
    let high = barDates.length - 1;
    let bestIdx = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (barDates[mid] >= targetDate) {
        bestIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return bestIdx !== -1 ? barDates[bestIdx] : null;
  };

  // 1. 決算発表マーカー (Earnings: E)
  if (options.showEarnings && fins && fins.length > 0) {
    // 開示日昇順にソート（決算発表当日の初回開示を優先採用）
    const sortedFins = [...fins].sort((a, b) => a.DiscDate.localeCompare(b.DiscDate));
    const seenDates = new Set<string>();
    const seenPeriods = new Set<string>();

    for (const fin of sortedFins) {
      if (!fin.DiscDate) continue;

      // 同一会計期間・決算期（例: "2026-06-30_1Q"）の重複を排除（初回短信発表日のみを採用）
      const periodKey =
        fin.CurPerEn && fin.CurPerType ? `${fin.CurPerEn}_${fin.CurPerType}` : null;
      if (periodKey && seenPeriods.has(periodKey)) continue;

      const snappedDate = snapToNextTradingDay(fin.DiscDate);
      if (!snappedDate || seenDates.has(snappedDate)) continue;

      let label = 'E: 決算';
      const period = fin.CurPerType || fin.DocType;
      if (period === 'FY') {
        label = 'E: 通期本決算';
      } else if (period === '1Q') {
        label = 'E: 1Q決算';
      } else if (period === '2Q') {
        label = 'E: 2Q中間';
      } else if (period === '3Q') {
        label = 'E: 3Q決算';
      }

      markers.push({
        time: snappedDate,
        position: 'belowBar',
        color: '#a855f7', // パープル
        shape: 'circle',
        text: label,
        id: `earnings-${fin.DiscDate}-${periodKey || ''}`,
        size: 1,
      });

      if (periodKey) seenPeriods.add(periodKey);
      seenDates.add(snappedDate);
    }
  }

  // 2. 配当マーカー (Dividends: D)
  // チャート上の過去ローソク足には、確定した実績年間配当のみをピン留め（進行期の会社予想はチャート下部の推移グラフで表示）
  if (options.showDividends && dividendHistory && dividendHistory.length > 0) {
    const seenDivDates = new Set<string>();

    for (const item of dividendHistory) {
      if (item.isForecast || !item.discDate || item.dps == null || item.dps <= 0) continue;
      const snappedDate = snapToNextTradingDay(item.discDate);
      if (!snappedDate || seenDivDates.has(snappedDate)) continue;

      markers.push({
        time: snappedDate,
        position: 'aboveBar',
        color: '#f59e0b', // アンバー
        shape: 'circle',
        text: `D: ${item.dps}円`,
        id: `dividend-${item.discDate}`,
        size: 1,
      });

      seenDivDates.add(snappedDate);
    }
  }

  // Lightweight Charts は time 昇順が必須
  return markers.sort((a, b) => a.time.localeCompare(b.time));
}



