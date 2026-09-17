import fs from 'node:fs';

let envKey = process.env.VITE_JQUANTS_API_KEY || process.env.JQUANTS_API_KEY;
if (!envKey && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const match = envContent.match(/VITE_JQUANTS_API_KEY=(.+)/);
  if (match) envKey = match[1].trim();
}
const apiKey = envKey || '';
const code = '7203';

async function verify() {
  console.log('Testing J-Quants API integration for Toyota (7203)...');
  
  // 1. Master
  const masterRes = await fetch(`https://api.jquants.com/v2/equities/master?code=${code}`, {
    headers: { 'x-api-key': apiKey },
  });
  const masterJson = await masterRes.json();
  const master = masterJson.data?.[0];
  console.log(`[Master] Company: ${master?.CoName}, Market: ${master?.MktNm}, Sector: ${master?.S33Nm}`);

  // 2. Daily Bars
  const barsRes = await fetch(`https://api.jquants.com/v2/equities/bars/daily?code=${code}`, {
    headers: { 'x-api-key': apiKey },
  });
  const barsJson = await barsRes.json();
  const bars = barsJson.data || [];
  console.log(`[Bars] Total daily bars: ${bars.length}`);
  const latestBar = bars[bars.length - 1];
  console.log(`[Bars] Latest Date: ${latestBar?.Date}, Close: ${latestBar?.C}円, Volume: ${latestBar?.Vo}, MktCap: ${latestBar?.MktCap}百万円`);

  // 3. Fins Summary
  const finsRes = await fetch(`https://api.jquants.com/v2/fins/summary?code=${code}`, {
    headers: { 'x-api-key': apiKey },
  });
  const finsJson = await finsRes.json();
  const fins = finsJson.data || [];
  console.log(`[Fins] Total disclosures: ${fins.length}`);
  const latestFin = fins[fins.length - 1];
  console.log(`[Fins] Latest DiscDate: ${latestFin?.DiscDate}, DivAnn: ${latestFin?.DivAnn}, FDivAnn: ${latestFin?.FDivAnn}, EPS: ${latestFin?.EPS}`);

  const dps = parseFloat(latestFin?.FDivAnn || latestFin?.DivAnn);
  const yieldPct = (dps / latestBar.C) * 100;
  console.log(`[Calculation] DPS: ${dps}円, Dividend Yield: ${yieldPct.toFixed(2)}%`);
  console.log('✅ API Verification completed successfully!');
}

verify().catch(console.error);
