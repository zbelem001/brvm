import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { init, dispose, Chart, KLineData, getSupportedIndicators } from 'klinecharts';

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
      // after the data is reloaded we need to hide any overlays that were
      // drawn in a different timeframe – the library renders them according
      // to their original timestamps, so they would otherwise pollute the
      // new view (especially obvious when going from 15m/1h to 1M).
      Object.keys(this.overlayTimeframe).forEach(id => {
        const created = this.overlayTimeframe[id];
        const visible = created === this._timeframe;
        // overrideOverlay supports `visible` flag; if it doesn't the
        // alternative is to remove/restore or apply a transparent style.
        this.chart?.overrideOverlay({ id, visible });
      });
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

  // indicator names correspond to the ones passed to chart.createIndicator()
  // indicators available for toggling.  `code` is the actual name
  // understood by klinecharts; `label` is what we show in the menu.
  indicatorList: Array<{ code: string; label: string; color?: string }> = [
    { code: 'RSI', label: 'RSI (14)', color: '#2962FF' },
    { code: 'MACD', label: 'MACD (12,26,9)', color: '#E040FB' },
    { code: 'BOLL', label: 'Bollinger Bands', color: '#26C6DA' },
    { code: 'MA', label: 'MA (20/50/200)', color: '#FFB300' },
    { code: 'EMA', label: 'EMA', color: '#FF5722' },
    { code: 'SMA', label: 'SMA', color: '#8BC34A' },
    { code: 'VOL', label: 'Volume', color: '#9E9E9E' },
    { code: 'OBV', label: 'On Balance Volume', color: '#607D8B' },
    { code: 'KDJ', label: 'Stochastique', color: '#FF4081' }
  ];

  // runtime state for whether an indicator is currently shown
  indicators: Record<string, boolean> = {};
  // pane IDs are derived from the code, no need to remember separately

  activeDrawingTool = 'cursor';
  // keep a history of created overlay ids so we can undo or clear
  overlayIds: string[] = [];
  // remember which timeframe each overlay was created in so we can
  // selectively hide/show when the user switches period
  overlayTimeframe: Record<string, '1D' | '1W' | '1M'> = {};

  // ticker picker state
  showPicker = false;
  pickerSearch = '';
  allTickers: any[] = [];
  watchlistSymbols: Set<string> = new Set();

  // latest price/change info for each ticker (populated from API)
  tickerInfo: Record<string, any> = {};

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
    // initialise indicator flags
    this.indicatorList.forEach(i => (this.indicators[i.code] = false));
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

        // pre-populate tickerInfo from response if it already contains change
        this.tickerInfo = {};
        this.allTickers.forEach(t => {
          if (t.chg !== undefined) {
            this.tickerInfo[t.symbol] = t;
          }
        });

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
        // remember full result in tickerInfo for use by picker
        this.tickerInfo = {};
        data.forEach(item => {
          this.tickerInfo[item.symbol] = item;
        });

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
    return this.allTickers
      .filter(t =>
        t.symbol.toLowerCase().includes(term) ||
        (t.name && t.name.toLowerCase().includes(term))
      )
      .map(t => {
        const info = this.tickerInfo[t.symbol] || {};
        return {
          ...t,
          change: info.chg !== undefined ? parseFloat(info.chg.toFixed(2)) : 0
        };
      });
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

  /**
   * Add new indicator names to the available set.  Existing names (either
   * already present in UI or not supported by the library) are ignored.
   */
  /**
   * Add indicators programmatically.  Each entry can be a string code or an
   * object with { code, label, color }.  Duplicates and unsupported codes are
   * filtered out.
   */
  addIndicators(entries: Array<string | { code: string; label?: string; color?: string }>) {
    const supported = getSupportedIndicators();
    entries.forEach(entry => {
      let code: string, label: string | undefined, color: string | undefined;
      if (typeof entry === 'string') {
        code = entry;
      } else {
        code = entry.code;
        label = entry.label;
        color = entry.color;
      }
      if (!supported.includes(code)) return;
      if (this.indicatorList.find(i => i.code === code)) return;
      this.indicatorList.push({ code, label: label ?? code, color });
      this.indicators[code] = false;
    });
  }



  toggleIndicator(code: string) {
    if (!this.chart) return;

    // ensure we're not left in a drawing mode; toggling an indicator is a
    // UI action and should behave like selecting the cursor.  Otherwise the
    // user might be unable to pan the chart because an active drawing tool
    // intercepts mouse events.
    if (this.activeDrawingTool !== 'cursor') {
      this.activeDrawingTool = 'cursor';
      // cancel any incomplete overlay
      if (this.pendingOverlayIds.length && this.chart) {
        this.pendingOverlayIds.forEach(id => this.chart?.removeOverlay({ id }));
        this.pendingOverlayIds = [];
      }
    }

    this.indicators[code] = !this.indicators[code];

    if (this.indicators[code]) {
      if (code === 'BOLL') {
        // overlay on candle pane rather than own pane
        this.chart.createIndicator(code, true, { id: 'candle_pane' });
      } else {
        const paneId = `pane_${code.toLowerCase()}`;
        this.chart.createIndicator(code, false, { id: paneId, height: 100 });
      }
    } else {
      if (code === 'BOLL') {
        this.chart.removeIndicator({ paneId: 'candle_pane', name: code });
      } else {
        const paneId = `pane_${code.toLowerCase()}`;
        this.chart.removeIndicator({ paneId, name: code });
      }
    }
  }

  // ─── Drawing Tools ────────────────────────────────────────────────────
  /**
   * Activate a drawing mode. Clicking the same icon again (or choosing
   * "cursor") will return to the default pointer and cancel any pending
   * (unfinished) overlay.  When a tool is active we create a new overlay as
   * soon as the previous one is finished, so the user can draw continuously
   * until they explicitly toggle the tool off.
   */

  // IDs of overlays that have been started but not yet completed (pending).
  pendingOverlayIds: string[] = [];

  setDrawingTool(tool: string) {
    // if switching away from the current tool (including to cursor) we need
    // to cancel any in‑progress drawing.
    if (this.activeDrawingTool === tool || tool === 'cursor') {
      // remove any pending overlays that were never finished
      if (this.pendingOverlayIds.length && this.chart) {
        this.pendingOverlayIds.forEach(id => this.chart?.removeOverlay({ id }));
        this.pendingOverlayIds = [];
      }

      this.activeDrawingTool = 'cursor';
      this.cdr.detectChanges();
      return;
    }

    // activate a new drawing tool and start the first overlay
    this.activeDrawingTool = tool;
    this.startDrawing(tool);
    this.cdr.detectChanges();
  }

  /**
   * Begin drawing using the given tool.  This method builds the necessary
   * callbacks/styles, starts the overlay, and arranges for the overlay id to
   * be moved from the pending list to the undo history when the user finishes
   * drawing.  If the tool is still active after completion we immediately
   * start a fresh overlay so the user can draw repeatedly.
   */
  private startDrawing(tool: string) {
    if (!this.chart) return;

    // choose a colour per tool and make the lines thinner (size=1)
    const toolStyles: Record<string, { color: string; size: number }> = {
      segment: { color: '#2196f3', size: 1 },
      horizontalStraightLine: { color: '#f44336', size: 1 },
      fibonacciLine: { color: '#4caf50', size: 1 },
      parallelStraightLine: { color: '#ff9800', size: 1 },
      simpleAnnotation: { color: '#9c27b0', size: 1 },
      priceLine: { color: '#03a9f4', size: 1 }
    };
    const baseStyle = toolStyles[tool] || { color: '#2196f3', size: 1 };

    // common callbacks for every overlay
    const callbacks: any = {
      onRightClick: (event: any) => {
        const id = event.overlay.id;
        this.chart?.removeOverlay({ id });
        this.overlayIds = this.overlayIds.filter(x => x !== id);
        return true;
      },
      onMouseEnter: (event: any) => {
        this.chart?.overrideOverlay({
          id: event.overlay.id,
          styles: {
            line: { color: '#ffb74d', size: 2 },
            text: { backgroundColor: '#ffb74d' }
          }
        });
      },
      onMouseLeave: (event: any) => {
        this.chart?.overrideOverlay({
          id: event.overlay.id,
          styles: {
            line: { color: baseStyle.color, size: baseStyle.size },
            text: { backgroundColor: baseStyle.color }
          }
        });
      }
    };

    // when the drawing completes we need to record the id and possibly
    // restart another overlay
    callbacks.onDrawEnd = (event: any) => {
      const id = event.overlay.id;
      // remove from pending list (might have been cancelled already)
      this.pendingOverlayIds = this.pendingOverlayIds.filter(x => x !== id);
      // add to history for undo/clear
      if (id) {
        this.overlayIds.push(id);
        this.overlayTimeframe[id] = this._timeframe;
      }
      // if tool still active, start another overlay
      if (this.activeDrawingTool === tool) {
        // small delay to avoid recursion inside event handler
        setTimeout(() => this.startDrawing(tool), 0);
      }
    };

    // special handling for fibonacci to cap points
    if (tool === 'fibonacciLine') {
      const orig = callbacks.onDrawEnd;
      callbacks.onDrawEnd = (event: any) => {
        const ov = event.overlay;
        if (ov.points && ov.points.length > 2) {
          ov.points = ov.points.slice(0, 2);
          this.chart?.overrideOverlay({ id: ov.id, points: ov.points });
        }
        orig(event);
      };
    }

    // construct overlay configuration; rectangle is custom
    let overlayConfig: any;
    if (tool === 'rectangle') {
      overlayConfig = {
        name: 'rectangle',
        totalStep: 2,
        needDefaultPointFigure: true,
        needDefaultXAxisFigure: true,
        needDefaultYAxisFigure: true,
        createPointFigures: ({ coordinates }: { coordinates: any[] }) => {
          if (coordinates.length === 2) {
            const p1 = coordinates[0];
            const p2 = coordinates[1];
            return [
              {
                type: 'line',
                attrs: { coordinates: [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }] }
              },
              {
                type: 'line',
                attrs: { coordinates: [{ x: p2.x, y: p1.y }, { x: p2.x, y: p2.y }] }
              },
              {
                type: 'line',
                attrs: { coordinates: [{ x: p2.x, y: p2.y }, { x: p1.x, y: p2.y }] }
              },
              {
                type: 'line',
                attrs: { coordinates: [{ x: p1.x, y: p2.y }, { x: p1.x, y: p1.y }] }
              }
            ];
          }
          return [];
        },
        styles: { line: { color: baseStyle.color, size: baseStyle.size } },
        ...callbacks
      };
    } else {
      overlayConfig = {
        name: tool,
        styles: { line: { color: baseStyle.color, size: baseStyle.size } },
        ...callbacks
      };
    }

    // start the overlay and remember the id(s) so we can cancel later if needed
    const created = this.chart.createOverlay(overlayConfig);
    const addPending = (id: string) => {
      if (id) this.pendingOverlayIds.push(id);
    };
    if (created) {
      if (Array.isArray(created)) {
        (created.filter(Boolean) as string[]).forEach(addPending);
      } else {
        addPending(created as string);
      }
    }
  }

  /**
   * Remove the most recently created overlay (undo).
   */
  undoDrawing() {
    if (this.chart && this.overlayIds.length) {
      const id = this.overlayIds.pop();
      if (id) {
        this.chart.removeOverlay({ id });
      }
    }
  }

  /**
   * Clear all drawings and reset history.
   */
  removeDrawings() {
    if (this.chart) {
      this.chart.removeOverlay();
      this.overlayIds = [];
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

    // Instead of relying on an unsupported registerOverlay method we will
    // build a rectangle overlay template and pass it directly to
    // createOverlay when the user selects the rectangle tool.

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
