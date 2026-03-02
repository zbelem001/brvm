from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

# build default Postgres URL based on credentials (from user request)
# database connection parameters come exclusively from environment variables
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
import urllib.parse

# do not provide a default password; require the caller to set DB_PASS explicitly
DB_PASS = os.getenv("DB_PASS", "")
# URL-encode in case password contains special characters such as @
DB_PASS_ENC = urllib.parse.quote(DB_PASS, safe="")
DB_NAME = os.getenv("DB_NAME", "brvm")  # use provided database name

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{DB_USER}:{DB_PASS_ENC}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# connect args for sqlite only
connect_args = {} if not DATABASE_URL.startswith("sqlite") else {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
