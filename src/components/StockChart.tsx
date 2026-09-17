import React, { useEffect, useRef, useState } from 'react';
import type { DailyBar, FinSummary, DividendHistoryItem } from '../types/jquants';
import { calculateSMA, generateChartMarkers } from '../utils/indicators';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';

interface StockChartProps {
  bars: DailyBar[];
  fins?: FinSummary[] | null;
  dividendHistory?: DividendHistoryItem[];
}

type PeriodType = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'ALL';

export const StockChart: React.FC<StockChartProps> = ({ bars, fins, dividendHistory }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // 系列の参照
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sma25SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma75SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 設定状態 (デフォルトはOFF)
  const [showSma25, setShowSma25] = useState(false);
  const [showSma75, setShowSma75] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  const [showDividends, setShowDividends] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('ALL');

  useEffect(() => {
    if (!chartContainerRef.current || !bars || bars.length === 0) return;

    // 既存チャートの破棄
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;

    // チャートの初期化
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.4)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.4)' },
      },
      crosshair: {
        mode: 1, // Magnet
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25, // 出来高領域を確保
        },
      },
      width: container.clientWidth,
      height: 480,
    });

    chartRef.current = chart;

    // 1. ローソク足系列
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    // ローソク足データ変換 (調整済み株価 AdjO, AdjH, AdjL, AdjC を利用)
    const candleData = bars.map((b) => ({
      time: b.Date,
      open: b.AdjO || b.O,
      high: b.AdjH || b.H,
      low: b.AdjL || b.L,
      close: b.AdjC || b.C,
    }));
    candleSeries.setData(candleData);

    // 2. 出来高系列 (サブスケール)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // 独立スケール
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.75, // 下部25%に配置
        bottom: 0,
      },
    });

    const volumeData = bars.map((b) => ({
      time: b.Date,
      value: b.AdjVo || b.Vo,
      color: (b.AdjC || b.C) >= (b.AdjO || b.O) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));
    volumeSeries.setData(volumeData);

    // 3. 移動平均線 (25日 SMA)
    const sma25 = calculateSMA(bars, 25);
    const sma25Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      title: '25 SMA',
    });
    sma25SeriesRef.current = sma25Series;
    sma25Series.setData(sma25);
    sma25Series.applyOptions({ visible: showSma25 });

    // 4. 移動平均線 (75日 SMA)
    const sma75 = calculateSMA(bars, 75);
    const sma75Series = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
      title: '75 SMA',
    });
    sma75SeriesRef.current = sma75Series;
    sma75Series.setData(sma75);
    sma75Series.applyOptions({ visible: showSma75 });

    // 5. 決算発表 (E) / 配当 (D) イベントマーカー
    const markers = generateChartMarkers(bars, fins, dividendHistory, {
      showEarnings,
      showDividends,
    });
    const seriesMarkers = createSeriesMarkers(candleSeries, markers);
    seriesMarkersRef.current = seriesMarkers;

    // 全体フィッティング
    chart.timeScale().fitContent();

    // リサイズハンドラ
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      seriesMarkersRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [bars, fins, dividendHistory]);

  // 移動平均線の表示切り替え
  useEffect(() => {
    if (sma25SeriesRef.current) {
      sma25SeriesRef.current.applyOptions({ visible: showSma25 });
    }
  }, [showSma25]);

  useEffect(() => {
    if (sma75SeriesRef.current) {
      sma75SeriesRef.current.applyOptions({ visible: showSma75 });
    }
  }, [showSma75]);

  // 決算 (E) / 配当 (D) マーカーの表示切り替え
  useEffect(() => {
    if (seriesMarkersRef.current) {
      const markers = generateChartMarkers(bars, fins, dividendHistory, {
        showEarnings,
        showDividends,
      });
      seriesMarkersRef.current.setMarkers(markers);
    }
  }, [bars, fins, dividendHistory, showEarnings, showDividends]);

  // 期間選択時のズーム変更
  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriod(newPeriod);
    if (!chartRef.current || !bars || bars.length === 0) return;

    const timeScale = chartRef.current.timeScale();
    if (newPeriod === 'ALL') {
      timeScale.fitContent();
      return;
    }

    // 営業日数による期間調整
    const daysMap: Record<PeriodType, number> = {
      '1M': 22,
      '3M': 66,
      '6M': 130,
      '1Y': 250,
      '3Y': 750,
      'ALL': bars.length,
    };

    const count = daysMap[newPeriod];
    const startIndex = Math.max(0, bars.length - count);
    const fromTime = bars[startIndex].Date;
    const toTime = bars[bars.length - 1].Date;

    timeScale.setVisibleRange({
      from: fromTime,
      to: toTime,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Chart Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white">株価推移チャート (日足)</h3>
          <span className="text-xs text-slate-500 font-mono">計{bars.length}日</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Moving Average Toggles */}
          <div className="flex items-center gap-3 text-xs bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <label className="flex items-center gap-1.5 cursor-pointer text-amber-400 font-medium">
              <input
                type="checkbox"
                checked={showSma25}
                onChange={(e) => setShowSma25(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>25日SMA</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-sky-400 font-medium">
              <input
                type="checkbox"
                checked={showSma75}
                onChange={(e) => setShowSma75(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>75日SMA</span>
            </label>
          </div>

          {/* Event Markers (E: 決算 / D: 配当) Toggles */}
          <div className="flex items-center gap-3 text-xs bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <label className="flex items-center gap-1.5 cursor-pointer text-purple-300 font-medium hover:text-purple-200 transition">
              <input
                type="checkbox"
                checked={showEarnings}
                onChange={(e) => setShowEarnings(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shadow-sm shadow-purple-500/50"></span>
                <span>決算 (E)</span>
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-amber-300 font-medium hover:text-amber-200 transition">
              <input
                type="checkbox"
                checked={showDividends}
                onChange={(e) => setShowDividends(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-sm shadow-amber-400/50"></span>
                <span>配当 (D)</span>
              </span>
            </label>
          </div>

          {/* Period Selector Buttons */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-1 border border-slate-800 text-xs font-medium">
            {(['1M', '3M', '6M', '1Y', '3Y', 'ALL'] as PeriodType[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={`px-2.5 py-1 rounded transition ${
                  period === p
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p === 'ALL' ? '5年(全期間)' : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div className="w-full relative rounded-lg overflow-hidden border border-slate-800/80">
        <div ref={chartContainerRef} className="w-full h-[480px]" />
      </div>

      {/* Chart Legend / Guide */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-1 pt-1 gap-2">
        <div className="flex flex-wrap items-center gap-3.5 font-medium">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span> 陽線
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span> 陰線
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2.5 h-1 rounded-sm bg-amber-400 inline-block"></span> 25日移動平均
          </span>
          <span className="flex items-center gap-1 text-sky-400">
            <span className="w-2.5 h-1 rounded-sm bg-sky-400 inline-block"></span> 75日移動平均
          </span>
          <span className="flex items-center gap-1 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shadow-sm shadow-purple-500/50"></span> 決算発表 (E)
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-sm shadow-amber-400/50"></span> 年間配当 (D)
          </span>
        </div>
        <div className="text-slate-500">ドラッグで移動、スクロールで拡大・縮小</div>
      </div>
    </div>
  );
};
