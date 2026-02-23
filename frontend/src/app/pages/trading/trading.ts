import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { init, dispose, Chart, KLineData } from 'klinecharts';

@Component({
  selector: 'app-trading',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trading.html',
  styleUrls: ['./trading.css']
})
export class TradingComponent implements OnInit, AfterViewInit, OnDestroy {

  // ─── Timeframe ────────────────────────────────────────────────────────
  private _timeframe: '1D' | '1W' | '1M' = '1D';
  get timeframe() { return this._timeframe; }

  // ─── Chart rendering mode ─────────────────────────────────────────────
  chartType: 'candles' | 'line' = 'candles';

  setTimeframe(tf: '1D' | '1W' | '1M') {
    this._timeframe = tf;
    if (this.dailyData.length && this.chart) {
      this.chart.resetData(); // Triggers a reload via DataLoader
    }
    this.cdr.detectChanges();
  }

  setChartType(type: 'candles' | 'line') {
    if (this.chartType === type) return;
    this.chartType = type;
    if (this.chart) {
      // map our semantic type to library style
      const style: any = { candle: { type: type === 'candles' ? 'candle_solid' : 'area' } };
      this.chart.setStyles(style);
      // force redraw
      this.chart.resetData();
    }
    this.cdr.detectChanges();
  }

  // ─── State ────────────────────────────────────────────────────────────
  private apiUrl = 'http://localhost:8000';

  watchlist: any[] = [];
  selectedAsset: any = null;
  lastCandle: any = null;
  showIndicatorMenu = false;

  indicators = { rsi: false, macd: false, bb: false };
  private indicatorPaneIds: Record<string, string | null> = { rsi: null, macd: null, bb: null };

  activeDrawingTool = 'cursor';

  // ticker picker state
  showPicker = false;
  pickerSearch = '';
  allTickers: any[] = [];
  watchlistSymbols: Set<string> = new Set();

  // ─── Chart ────────────────────────────────────────────────────────────
  private chart: Chart | null = null;
  private dailyData: KLineData[] = [];
  private resizeObserver!: ResizeObserver;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) { }

  // close indicator dropdown when user clicks anywhere outside it
  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent) {
    if (this.showIndicatorMenu) {
      // if the click target is not inside the indicator wrapper, hide menu
      const path = event.composedPath ? event.composedPath() : [];
      const clickedInside = path.some((el: any) => {
        return el && el.classList && el.classList.contains && el.classList.contains('indicator-wrapper');
      });
      if (!clickedInside) {
        this.showIndicatorMenu = false;
        this.cdr.detectChanges();
      }
    }
  }

  ngOnInit() {
    this.loadTickers();
  }

  ngAfterViewInit() {
    this.initChart();
    // loadWatchlist will be called once tickers are loaded/selection ready
  }

  ngOnDestroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.chart) {
      dispose('klinechart-main');
    }
  }

  // ─── Tickers & Watchlist ──────────────────────────────────────────────
  private loadTickers() {
    this.http.get<any[]>(`${this.apiUrl}/tickers-list`).subscribe({
      next: (data) => {
        this.allTickers = data;
        // restore user selection from localStorage
        const stored = localStorage.getItem('watchlistSymbols');
        if (stored) {
          try {
            JSON.parse(stored).forEach((s: string) => this.watchlistSymbols.add(s));
          } catch {}
        }
        // if nothing selected yet, default to the first ticker
        if (this.watchlistSymbols.size === 0 && this.allTickers.length > 0) {
          this.watchlistSymbols.add(this.allTickers[0].symbol);
        }
        this.loadWatchlist();
      },
      error: (err) => console.error('Error fetching tickers', err)
    });
  }

  loadWatchlist() {
    this.http.get<any[]>(`${this.apiUrl}/watchlist`).subscribe({
      next: (data: any[]) => {
        // filter backend results by selection set; if set is empty show all
        const filtered = data.filter(item =>
          this.watchlistSymbols.size === 0 || this.watchlistSymbols.has(item.symbol)
        );
        this.watchlist = filtered.map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.last || 0,
          change: item.chg ? parseFloat(item.chg.toFixed(2)) : 0,
          sector: item.sector || 'Equities'
        }));
        if (this.watchlist.length > 0 && !this.selectedAsset) {
          this.selectAsset(this.watchlist[0]);
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error fetching watchlist', err)
    });
  }

  selectAsset(asset: any) {
    this.selectedAsset = asset;
    this.dailyData = []; // Clear current asset data
    if (this.chart) {
      this.chart.setSymbol({
        ticker: asset.symbol,
        pricePrecision: 0,
        volumePrecision: 0
      });
      this.chart.resetData();
    }
    this.cdr.detectChanges();
  }

  // manage selection
  toggleTickerPicker() {
    this.showPicker = !this.showPicker;
    this.pickerSearch = '';
  }

  filteredTickers() {
    const term = this.pickerSearch.toLowerCase();
    return this.allTickers.filter(t =>
      t.symbol.toLowerCase().includes(term) ||
      (t.name && t.name.toLowerCase().includes(term))
    );
  }

  toggleSymbol(event: MouseEvent, symbol: string) {
    event.stopPropagation();
    if (this.watchlistSymbols.has(symbol)) {
      this.watchlistSymbols.delete(symbol);
      // if we removed the currently selected asset, clear it
      if (this.selectedAsset?.symbol === symbol) {
        this.selectedAsset = null;
      }
    } else {
      this.watchlistSymbols.add(symbol);
      // immediately select the new symbol so chart loads
      const found = this.allTickers.find(t => t.symbol === symbol);
      if (found) {
        this.selectAsset({
          symbol: found.symbol,
          name: found.name,
          price: 0,
          change: 0,
          sector: ''
        });
      }
    }
    this.saveSelection();
    this.loadWatchlist();
  }

  removeSymbol(symbol: string) {
    if (this.watchlistSymbols.has(symbol)) {
      this.watchlistSymbols.delete(symbol);
      this.saveSelection();
      this.loadWatchlist();
      if (this.selectedAsset && this.selectedAsset.symbol === symbol) {
        this.selectedAsset = this.watchlist.length ? this.watchlist[0] : null;
      }
    }
  }

  private saveSelection() {
    localStorage.setItem('watchlistSymbols', JSON.stringify(Array.from(this.watchlistSymbols)));
  }

  // ─── Indicators ───────────────────────────────────────────────────────
  toggleIndicatorMenu() { this.showIndicatorMenu = !this.showIndicatorMenu; }

  toggleIndicator(name: 'rsi' | 'macd' | 'bb') {
    if (!this.chart) return;
    this.indicators[name] = !this.indicators[name];

    if (this.indicators[name]) {
      switch (name) {
        case 'rsi':
          this.indicatorPaneIds['rsi'] = this.chart.createIndicator('RSI', false, { id: 'pane_rsi', height: 100 });
          break;
        case 'macd':
          this.indicatorPaneIds['macd'] = this.chart.createIndicator('MACD', false, { id: 'pane_macd', height: 120 });
          break;
        case 'bb':
          this.chart.createIndicator('BOLL', true, { id: 'candle_pane' });
          break;
      }
    } else {
      switch (name) {
        case 'rsi':
          if (this.indicatorPaneIds['rsi']) this.chart.removeIndicator({ paneId: 'pane_rsi' });
          this.indicatorPaneIds['rsi'] = null;
          break;
        case 'macd':
          if (this.indicatorPaneIds['macd']) this.chart.removeIndicator({ paneId: 'pane_macd' });
          this.indicatorPaneIds['macd'] = null;
          break;
        case 'bb':
          this.chart.removeIndicator({ paneId: 'candle_pane', name: 'BOLL' });
          break;
      }
    }
  }

  // ─── Drawing Tools ────────────────────────────────────────────────────
  setDrawingTool(tool: string) {
    this.activeDrawingTool = tool;
    if (this.chart && tool !== 'cursor') {
      this.chart.createOverlay({
        name: tool,
        styles: {
          line: { color: '#2196f3', size: 2 }
        },
        onRightClick: (event) => {
          this.chart?.removeOverlay({ id: event.overlay.id });
          return true;
        },
        onMouseEnter: (event) => {
          this.chart?.overrideOverlay({
            id: event.overlay.id,
            styles: {
              line: { color: '#ffb74d', size: 3 },
              text: { backgroundColor: '#ffb74d' }
            }
          });
        },
        onMouseLeave: (event) => {
          this.chart?.overrideOverlay({
            id: event.overlay.id,
            styles: {
              line: { color: '#2196f3', size: 2 },
              text: { backgroundColor: '#2196f3' }
            }
          });
        }
      });
    }
  }

  removeDrawings() {
    if (this.chart) {
      this.chart.removeOverlay();
    }
  }

  // ─── Chart Init ───────────────────────────────────────────────────────
  private initChart() {
    const el = document.getElementById('klinechart-main');
    if (!el) return;

    this.chart = init('klinechart-main', {
      styles: {
        grid: {
          horizontal: { color: '#2a2e39' },
          vertical: { color: '#2a2e39' }
        },
        candle: {
          bar: {
            upColor: '#089981',
            downColor: '#f23645',
            noChangeColor: '#666',
            upBorderColor: '#089981',
            downBorderColor: '#f23645',
            noChangeBorderColor: '#666',
            upWickColor: '#089981',
            downWickColor: '#f23645',
            noChangeWickColor: '#666'
          },
          tooltip: {
            /* disable built-in tooltip that shows grey box on mouse move */
            showRule: ('never' as any),
            showType: 'standard'
          }
        },
        xAxis: {
          axisLine: { color: '#2a2e39' },
          tickLine: { color: '#2a2e39' },
          tickText: { color: '#787b86' }
        },
        yAxis: {
          axisLine: { color: '#2a2e39' },
          tickLine: { color: '#2a2e39' },
          tickText: { color: '#787b86' }
        },
        crosshair: {
          horizontal: {
            line: { color: '#758696' },
            text: { backgroundColor: '#2a2e39', color: '#d1d4dc' }
          },
          vertical: {
            line: { color: '#758696' },
            text: { backgroundColor: '#2a2e39', color: '#d1d4dc' }
          }
        }
      },
      locale: 'en-US'
    });

    if (!this.chart) return;

    // DataLoader Integration
    console.log('Setting up DataLoader...');
    this.chart.setDataLoader({
      getBars: (params) => {
        console.log('getBars called with params:', params);
        const { symbol, callback } = params;
        if (!this.selectedAsset) {
          console.warn('getBars called but selectedAsset is null');
          callback([], false);
          return;
        }

        const url = `${this.apiUrl}/history/${this.selectedAsset.symbol}`;
        console.log('Fetching history from:', url);
        this.http.get<any>(url).subscribe({
          next: (response) => {
            console.log('History response received:', response);
            if (response?.data) {
              this.dailyData = response.data
                .map((d: any) => ({
                  timestamp: new Date(d.date).getTime(),
                  open: d.open,
                  high: d.high,
                  low: d.low,
                  close: d.close,
                  volume: d.volume ?? 0
                }))
                .sort((a: any, b: any) => a.timestamp - b.timestamp);

              const visibleData = this._timeframe === '1D'
                ? this.dailyData
                : this.aggregateBars(this.dailyData, this._timeframe);

              console.log(`Rendering ${visibleData.length} bars for timeframe ${this._timeframe}`);
              if (visibleData.length > 0) {
                const last = visibleData[visibleData.length - 1];
                this.lastCandle = { open: last.open, high: last.high, low: last.low, close: last.close };
              }

              callback(visibleData, false);
              this.cdr.detectChanges();
            } else {
              callback([], false);
            }
          },
          error: (err) => {
            console.error('Error fetching history', err);
            callback([], false);
          }
        });
      }
    });

    // Explicitly set period to trigger initial load if symbol is set
    this.chart.setPeriod({ type: 'day', span: 1 });

    // crosshair events will fire once the user moves the mouse over the chart
    // (setCrosshair is not exposed on the public Chart type)

    // Listen for crosshair to update the OHLCV legend
    this.chart.subscribeAction('onCrosshairChange', (data: any) => {
      if (data && data.kLineData) {
        this.lastCandle = {
          open: data.kLineData.open,
          high: data.kLineData.high,
          low: data.kLineData.low,
          close: data.kLineData.close
        };
        this.cdr.detectChanges();
      }
      // otherwise leave the previous candle in place; it will update next time
      // a valid kLineData point is under the crosshair
    });

    // Responsive
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(el);
  }

  /**
   * Aggregate daily KLineChart bars into weekly ('1W') or monthly ('1M') bars.
   */
  private aggregateBars(daily: KLineData[], period: '1W' | '1M'): KLineData[] {
    const getKey = (ts: number) => {
      const d = new Date(ts);
      if (period === '1W') {
        const day = d.getUTCDay() || 7;
        const mon = new Date(d);
        mon.setUTCDate(d.getUTCDate() - day + 1);
        mon.setUTCHours(0, 0, 0, 0);
        return mon.getTime();
      } else {
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      }
    };

    const buckets = new Map<number, KLineData>();

    for (const bar of daily) {
      const key = getKey(bar.timestamp);
      if (!buckets.has(key)) {
        buckets.set(key, { ...bar, timestamp: key });
      } else {
        const b = buckets.get(key)!;
        b.high = Math.max(b.high, bar.high);
        b.low = Math.min(b.low, bar.low);
        b.close = bar.close;
        b.volume = (b.volume ?? 0) + (bar.volume ?? 0);
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
}
