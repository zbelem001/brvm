from sqlalchemy.orm import Session
import pandas as pd
import pandas_ta as ta
from datetime import datetime

from . import models


def get_history_with_indicators(db: Session, symbol: str, lookback: int = 0):
    # retrieve ticker and prices, convert to pandas, compute TA indicators
    ticker = db.query(models.Ticker).filter(models.Ticker.symbol == symbol).first()
    if not ticker:
        return None

    prices = (
        db.query(models.Price)
        .filter(models.Price.ticker_id == ticker.id)
        .order_by(models.Price.date)
        .all()
    )
    df = pd.DataFrame([
        {
            "date": p.date,
            "open": float(p.open) if p.open is not None else None,
            "high": float(p.high) if p.high is not None else None,
            "low": float(p.low) if p.low is not None else None,
            "close": float(p.close) if p.close is not None else None,
            "volume": p.volume,
        }
        for p in prices
    ])
    if df.empty:
        return []

    df.set_index("date", inplace=True)
    # indicators
    df["rsi"] = ta.rsi(df["close"], length=14)
    macd = ta.macd(df["close"])
    df = df.join(macd)
    bb = ta.bbands(df["close"])
    df = df.join(bb)

    result = df.reset_index().to_dict(orient="records")
    return result


def market_summary(db: Session):
    # compute summary for the latest trading day
    latest = db.query(models.Price.date).distinct().order_by(models.Price.date.desc()).first()
    if not latest:
        return {"top": [], "flop": [], "indices": {}}
    latest_date = latest[0]

    # get prices for latest and previous date
    prev_date = (
        db.query(models.Price.date)
        .filter(models.Price.date < latest_date)
        .order_by(models.Price.date.desc())
        .first()
    )
    prev_date = prev_date[0] if prev_date else None

    query = (
        db.query(models.Price, models.Ticker.symbol)
        .join(models.Ticker)
        .filter(models.Price.date == latest_date)
    )
    rows = query.all()

    recs = []
    for price, sym in rows:
        rec = {"symbol": sym, "close": float(price.close)}
        if prev_date:
            prev_price = (
                db.query(models.Price)
                .filter(models.Price.ticker_id == price.ticker_id, models.Price.date == prev_date)
                .first()
            )
            if prev_price and prev_price.close:
                rec["change"] = float(price.close - prev_price.close) / float(prev_price.close) * 100
        recs.append(rec)

    # sort by change for top and flop
    sorted_by_change = sorted([r for r in recs if "change" in r], key=lambda x: x["change"], reverse=True)
    top = sorted_by_change[:5]
    flop = sorted_by_change[-5:][::-1]

    return {"top": top, "flop": flop, "indices": {}}


def get_watchlist(db: Session):
    # return all tickers with latest close and day change%
    results = []
    # find latest date available
    latest = db.query(models.Price.date).distinct().order_by(models.Price.date.desc()).first()
    if not latest:
        return []
    latest_date = latest[0]
    prev_date = (
        db.query(models.Price.date)
        .filter(models.Price.date < latest_date)
        .order_by(models.Price.date.desc())
        .first()
    )
    prev_date = prev_date[0] if prev_date else None

    for t in db.query(models.Ticker).all():
        price = (
            db.query(models.Price)
            .filter(models.Price.ticker_id == t.id, models.Price.date == latest_date)
            .first()
        )
        entry = {"symbol": t.symbol, "name": t.name}
        if price:
            entry["last"] = float(price.close)
            if prev_date:
                pprev = (
                    db.query(models.Price)
                    .filter(models.Price.ticker_id == t.id, models.Price.date == prev_date)
                    .first()
                )
                if pprev and pprev.close:
                    entry["chg"] = (float(price.close) - float(pprev.close)) / float(pprev.close) * 100
        results.append(entry)
    return results
