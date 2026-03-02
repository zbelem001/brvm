"""Simple utility to seed the database with sample tickers and prices."""
import random
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal, engine


models.Base.metadata.create_all(bind=engine)

SAMPLE_TICKERS = [
    ("SNTS", "SONATEL"),
    ("SLBC", "SOCIETE LE LAIT DU BURKINA"),
]


def seed_prices(db: Session, ticker: models.Ticker, days: int = 30):
    today = date.today()
    for i in range(days):
        d = today - timedelta(days=days - i)
        # random price around 10000
        price = 10000 + random.randint(-500, 500)
        openp = price + random.randint(-50, 50)
        highp = max(price, openp) + random.randint(0, 100)
        lowp = min(price, openp) - random.randint(0, 100)
        vol = random.randint(1000, 10000)
        p = models.Price(
            ticker_id=ticker.id,
            date=d,
            open=openp,
            high=highp,
            low=lowp,
            close=price,
            adj_close=price,
            volume=vol,
        )
        db.merge(p)
    db.commit()


def main():
    db = SessionLocal()
    for symbol, name in SAMPLE_TICKERS:
        tk = db.query(models.Ticker).filter(models.Ticker.symbol == symbol).first()
        if not tk:
            tk = models.Ticker(symbol=symbol, name=name)
            db.add(tk)
            db.commit()
            db.refresh(tk)
        seed_prices(db, tk, days=60)
    db.close()


if __name__ == "__main__":
    main()
