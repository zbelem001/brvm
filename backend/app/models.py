from sqlalchemy import Column, Integer, String, Date, Numeric, BigInteger, ForeignKey
from sqlalchemy.orm import relationship

from .database import Base


class Ticker(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    sector = Column(String, nullable=True)
    listed_date = Column(Date, nullable=True)

    prices = relationship("Price", back_populates="ticker")


class Price(Base):
    __tablename__ = "prices"

    ticker_id = Column(Integer, ForeignKey("tickers.id"), primary_key=True)
    date = Column(Date, primary_key=True)
    open = Column(Numeric(12, 4), nullable=True)
    high = Column(Numeric(12, 4), nullable=True)
    low = Column(Numeric(12, 4), nullable=True)
    close = Column(Numeric(12, 4), nullable=True)
    adj_close = Column(Numeric(12, 4), nullable=True)
    volume = Column(BigInteger, nullable=True)

    ticker = relationship("Ticker", back_populates="prices")
