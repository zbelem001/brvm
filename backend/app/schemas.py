from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class PriceBase(BaseModel):
    date: date
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    adj_close: Optional[float] = None
    volume: Optional[int] = None
    
    class Config:
        extra = "allow"


class Price(PriceBase):
    class Config:
        orm_mode = True


class Ticker(BaseModel):
    symbol: str
    name: Optional[str]
    sector: Optional[str]
    # optional live data supplied by endpoints such as /watchlist or
    # /tickers-list to reduce extra requests
    last: Optional[float] = None
    chg: Optional[float] = None

    class Config:
        orm_mode = True


class HistoryResponse(BaseModel):
    ticker: str
    data: List[Price]


class MarketSummary(BaseModel):
    top: List[Price]
    flop: List[Price]
    indices: dict
