"""Deep Scraper for ALL BRVM tickers history from sikafinance API.

Iterates over all tickers in the database and fetches their full history
backwards until no more data is returned.
"""
import sys
import os
import time
import requests
import urllib3
from datetime import datetime, timedelta
from sqlalchemy import func

# when this script is run from backend/scripts, ensure the parent directory
# of "app" is on the import path
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from app import models
from app.database import SessionLocal, engine

# Suppress insecure request warnings for verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Constants
API_URL = "https://www.sikafinance.com/api/general/GetHistos"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

def fetch_segment(ticker: str, start: str, end: str):
    payload = {
        "ticker": ticker,
        "datedeb": start,
        "datefin": end,
        "xperiod": "0"  # daily
    }
    headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=30, verify=False)
        resp.raise_for_status()
        data = resp.json()
        if not data or "lst" not in data:
            return []
        return data["lst"]
    except Exception as e:
        print(f"\n  [Error fetching {ticker} {start}-{end}: {e}]")
        return []

def store_prices(db, ticker_id, rows):
    for r in rows:
        try:
            d = datetime.strptime(r["Date"], "%d/%m/%Y").date()
            p = models.Price(
                ticker_id=ticker_id,
                date=d,
                open=r.get("Open"),
                high=r.get("High"),
                low=r.get("Low"),
                close=r.get("Close"),
                adj_close=r.get("Close"),
                volume=r.get("Volume"),
            )
            db.merge(p)
        except:
            continue
    db.commit()

def scrape_ticker_history(db, ticker):
    # Skip indices and composite indicators if needed, or process them too
    # For now process all
    symbol = ticker.symbol
    print(f"\n>>> Processing {symbol} ({ticker.name})")

    # Find earliest date in DB for this ticker
    min_date_row = db.query(func.min(models.Price.date)).filter(models.Price.ticker_id == ticker.id).first()
    
    if min_date_row and min_date_row[0]:
        min_date = min_date_row[0]
        print(f"  Existing data starts at {min_date}. Resuming backward...")
    else:
        min_date = datetime.today().date()
        print(f"  No existing data. Starting from today.")
    
    chunk_days = 90
    empty_count = 0
    max_empty_chunks = 2
    hard_limit = datetime(1990, 1, 1).date()

    total_added = 0
    while empty_count < max_empty_chunks and min_date > hard_limit:
        end_date = min_date - timedelta(days=1)
        start_date = end_date - timedelta(days=chunk_days)
        
        if start_date < hard_limit:
            start_date = hard_limit

        print(f"  {start_date} -> {end_date}...", end=" ", flush=True)
        rows = fetch_segment(symbol, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
        
        if rows:
            count = len(rows)
            print(f"OK ({count})")
            store_prices(db, ticker.id, rows)
            total_added += count
            
            # Find the actual minimum date in the returned rows
            segment_min = None
            for r in rows:
                try:
                    rd = datetime.strptime(r["Date"], "%d/%m/%Y").date()
                    if segment_min is None or rd < segment_min:
                        segment_min = rd
                except:
                    continue
            
            if segment_min:
                min_date = segment_min
            else:
                min_date = start_date
            
            empty_count = 0
        else:
            print("EMPTY")
            empty_count += 1
            min_date = start_date

        time.sleep(0.5) # Slight delay to avoid hammering

    print(f"  Done for {symbol}. Total rows fetched in this session: {total_added}")

def main():
    db = SessionLocal()
    models.Base.metadata.create_all(bind=engine)
    
    tickers = db.query(models.Ticker).all()
    print(f"Starting historical deep scrape for {len(tickers)} tickers.")

    for ticker in tickers:
        try:
            scrape_ticker_history(db, ticker)
        except Exception as e:
            print(f"Critical error on {ticker.symbol}: {e}")
            continue
            
    db.close()
    print("\nGlobal historical sweep complete!")

if __name__ == "__main__":
    main()
