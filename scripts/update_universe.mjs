import fs from 'node:fs';
import path from 'node:path';

let envKey = process.env.VITE_JQUANTS_API_KEY || process.env.JQUANTS_API_KEY;
if (!envKey && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/VITE_JQUANTS_API_KEY=(.+)/);
  if (match) envKey = match[1].trim();
}
const apiKey = envKey || '';

if (!apiKey) {
  console.error('Error: VITE_JQUANTS_API_KEY is required in .env');
  process.exit(1);
}

// レート制限を守るためのスリープ関数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('Fetching Master, Valuation, and Daily Bars from J-Quants API...');

  // 1. マスターデータ
  const masterRes = await fetch('https://api.jquants.com/v2/equities/master', {
    headers: { 'x-api-key': apiKey },
  });
  const masterJson = await masterRes.json();
  const masterList = masterJson.data || [];

  // 代表銘柄（7203）から最新日を取得
  const toyotaBarsRes = await fetch('https://api.jquants.com/v2/equities/bars/daily?code=7203', {
    headers: { 'x-api-key': apiKey },
  });
  const toyotaBarsJson = await toyotaBarsRes.json();
  const latestDate = toyotaBarsJson.data?.[toyotaBarsJson.data.length - 1]?.Date || '2026-09-15';
  console.log(`Latest market date detected: ${latestDate}`);

  // 2. 最新日のバリュエーションと株価
  const [valRes, barsRes] = await Promise.all([
    fetch(`https://api.jquants.com/v2/equities/valuation?date=${latestDate}`, {
      headers: { 'x-api-key': apiKey },
    }),
    fetch(`https://api.jquants.com/v2/equities/bars/daily?date=${latestDate}`, {
      headers: { 'x-api-key': apiKey },
    }),
  ]);
  const valJson = await valRes.json();
  const barsJson = await barsRes.json();

  const valMap = new Map();
  valJson.data?.forEach((v) => valMap.set(v.Code, v));
  const barMap = new Map();
  barsJson.data?.forEach((b) => barMap.set(b.Code, b));

  // 普通株 (ProdCat === '011')
  const common = masterList.filter((d) => d.ProdCat === '011');

  // TOPIX Core30, Large70, Mid400
  const topixCoreAndLarge = common.filter(
    (d) => d.ScaleCat === 'TOPIX Core30' || d.ScaleCat === 'TOPIX Large70'
  );
  const topixMid = common.filter((d) => d.ScaleCat === 'TOPIX Mid400');

  // 時価総額順でMid400から301銘柄を選択して合計400銘柄に
  const sortedMid = topixMid.sort((a, b) => {
    const valA = valMap.get(a.Code)?.MktCap || 0;
    const valB = valMap.get(b.Code)?.MktCap || 0;
    return valB - valA;
  });

  const jpx400RawList = [...topixCoreAndLarge, ...sortedMid.slice(0, 400 - topixCoreAndLarge.length)];

  console.log(`Total JPX400 selected: ${jpx400RawList.length}`);

  // 主要主力銘柄（上位50社など）の正確な配当金をAPIから取得
  const topCodesToFetch = [
    '7203', '8306', '9432', '8031', '1605', '6758', '6861', '8058', '9984', '4502',
    '8316', '8411', '8766', '8591', '8001', '8053', '8002', '6501', '4063', '8035',
    '6752', '9433', '9434', '9613', '4568', '4503', '4519', '6098', '9983', '8267',
    '3382', '7974', '6367', '9022', '9020', '9531', '9503', '2914', '5401', '9101',
    '9104', '9107', '7011', '7267', '6902', '7751', '6981', '7741', '4901', '5108'
  ];

  const dpsMap = new Map();
  console.log(`Fetching exact dividends for top ${topCodesToFetch.length} stocks...`);

  for (let i = 0; i < topCodesToFetch.length; i++) {
    const code = topCodesToFetch[i];
    try {
      const res = await fetch(`https://api.jquants.com/v2/fins/summary?code=${code}`, {
        headers: { 'x-api-key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        const fins = data.data || [];
        for (let j = fins.length - 1; j >= 0; j--) {
          const f = fins[j];
          const fdiv = parseFloat(f.FDivAnn);
          const div = parseFloat(f.DivAnn);
          if (!isNaN(fdiv) && fdiv > 0) {
            dpsMap.set(code, fdiv);
            break;
          } else if (!isNaN(div) && div > 0) {
            dpsMap.set(code, div);
            break;
          }
        }
      }
      // レート制限に配慮して100msウェイト
      await sleep(100);
    } catch (err) {
      console.warn(`Failed to fetch fins for ${code}`, err);
    }
  }

  console.log(`Exact dividends fetched: ${dpsMap.size}`);

  // 全JPX400銘柄のアイテム作成
  const items = jpx400RawList.map((m) => {
    const code4 = m.Code.replace(/0$/, '');
    const val = valMap.get(m.Code);
    const bar = barMap.get(m.Code);
    const isTopix100 = m.ScaleCat === 'TOPIX Core30' || m.ScaleCat === 'TOPIX Large70';
    const isPrime = m.MktNm === 'プライム';

    // 配当金の決定ロジック:
    // APIで取得した公式開示実値があればそれを使用（未取得の場合はnullとし、安易な推計値の捏造は厳禁）
    const dps = dpsMap.get(code4) ?? null;

    return {
      code: code4,
      rawCode: m.Code,
      name: m.CoName,
      sector: m.S33Nm || '-',
      market: m.MktNm || 'プライム',
      scaleCat: m.ScaleCat || '-',
      dpsAnnual: dps,
      isJpx400: true,
      isTopix100,
      isPrime,
    };
  });

  // コード昇順ソート
  items.sort((a, b) => a.code.localeCompare(b.code));

  // TypeScriptコード生成
  const fileContent = `/**
 * JPX日経インデックス400 (JPX400) および主要構成銘柄マスターデータ
 * 自動生成スクリプト: scripts/update_universe.mjs
 * 生成日時: ${new Date().toISOString()}
 * 収録銘柄数: ${items.length}銘柄
 */

export interface UniverseStockMeta {
  code: string;
  rawCode: string;
  name: string;
  sector: string;
  market: string;
  scaleCat: string;
  dpsAnnual: number | null;
  isJpx400: boolean;
  isTopix100: boolean;
  isPrime: boolean;
}

export const JPX400_UNIVERSE: UniverseStockMeta[] = ${JSON.stringify(items, null, 2)};

export const JPX400_CODE_MAP = new Map<string, UniverseStockMeta>(
  JPX400_UNIVERSE.map((item) => [item.code, item])
);

export const DEFAULT_WATCHLIST_CODES = ['7203', '8306', '9432', '8031', '1605'];
`;

  const outPath = path.resolve('src/data/jpx400Data.ts');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`✅ Successfully generated ${outPath} with ${items.length} stocks!`);
}

main().catch(console.error);
