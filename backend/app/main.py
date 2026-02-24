from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from . import models, schemas, services
from .database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="BRVM Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In a real app, specify the Angular port, e.g., ["http://localhost:4200"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/tickers-list", response_model=List[schemas.Ticker])
def read_tickers(db: Session = Depends(get_db)):
    # return tickers along with last price and daily change if available
    tickers = db.query(models.Ticker).all()
    # reuse watchlist logic to compute latest values
    watch = services.get_watchlist(db)
    watch_map = {w["symbol"]: w for w in watch}

    result = []
    for t in tickers:
        entry: dict = {"symbol": t.symbol, "name": t.name, "sector": t.sector}
        const_info = watch_map.get(t.symbol)
        if const_info:
            if "last" in const_info:
                entry["last"] = const_info["last"]
            if "chg" in const_info:
                entry["chg"] = const_info["chg"]
        result.append(entry)
    return result


@app.get("/history/{symbol}", response_model=schemas.HistoryResponse)
def get_history(symbol: str, db: Session = Depends(get_db)):
    data = services.get_history_with_indicators(db, symbol)
    if data is None:
        raise HTTPException(status_code=404, detail="Ticker not found")
    # wrap in response model
    return {"ticker": symbol, "data": data}


@app.get("/market-summary", response_model=schemas.MarketSummary)
def get_summary(db: Session = Depends(get_db)):
    summary = services.market_summary(db)
    return schemas.MarketSummary(**summary)

@app.get("/watchlist")
def watchlist(db: Session = Depends(get_db)):
    # simple list of tickers
    return services.get_watchlist(db)
