"""Scraper for AGL (SDSC.ci) history from sikafinance API.

Usage:
    python scrape_agl.py [start_date] [end_date]

The script will request the internal endpoint in slices of 90 days
(max allowed) and insert or update prices into the database.
"""
from datetime import datetime, timedelta
import time
import requests
import os

from sqlalchemy.orm import Session
from app import models
from app.database import SessionLocal, engine

# ensure tables exist
models.Base.metadata.create_all(bind=engine)

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
    resp = requests.post(API_URL, json=payload, headers=headers, timeout=30, verify=False)
    resp.raise_for_status()
    data = resp.json()
    if not data or "lst" not in data:
        raise ValueError(f"Unexpected response: {data}")
    return data["lst"]


def store_prices(db: Session, ticker_code: str, rows: list):
    # ensure ticker exists (and update name if known)
    ticker = db.query(models.Ticker).filter(models.Ticker.symbol == ticker_code).first()
    if not ticker:
        ticker = models.Ticker(symbol=ticker_code)
        db.add(ticker)
        db.commit()
        db.refresh(ticker)
    # for demonstration we know the mapping of SDSC.ci => Africa Global Logistics
    if ticker_code == "SDSC.ci" and (not ticker.name or "Africa" not in ticker.name):
        ticker.name = "AFRICA GLOBAL LOGISTICS"
        db.add(ticker)
        db.commit()

    for r in rows:
        # expected fields: Date, Close, Open, High, Low, Volume
        try:
            d = datetime.strptime(r["Date"], "%d/%m/%Y").date()
        except Exception:
            continue
        p = models.Price(
            ticker_id=ticker.id,
            date=d,
            open=r.get("Open"),
            high=r.get("High"),
            low=r.get("Low"),
            close=r.get("Close"),
            adj_close=r.get("Close"),
            volume=r.get("Volume"),
        )
        db.merge(p)  # upsert
    db.commit()


def main():
    # default range: last 3 years
    end_date = datetime.today().date()
    start_date = end_date - timedelta(days=365 * 3)
    import sys
    if len(sys.argv) >= 3:
        start_date = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        end_date = datetime.strptime(sys.argv[2], "%Y-%m-%d").date()

    # break into chunks of 90 days
    chunk = timedelta(days=90)
    db = SessionLocal()
    ticker = "SDSC.ci"  # AGL
    cur = start_date
    while cur < end_date:
        seg_end = min(cur + chunk, end_date)
        print(f"Fetching {cur} -> {seg_end}")
        try:
            rows = fetch_segment(ticker, cur.strftime("%Y-%m-%d"), seg_end.strftime("%Y-%m-%d"))
            store_prices(db, ticker, rows)
        except Exception as e:
            print("error", e)
        cur = seg_end + timedelta(days=1)
        time.sleep(1)  # be polite
    db.close()


if __name__ == "__main__":
    main()
