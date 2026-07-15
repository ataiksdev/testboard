import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Create a local SQLite database file in the root directory
DATABASE_URL = "sqlite:///./database.db"

# The connect_args={"check_same_thread": False} is needed only for SQLite.
# It allows multiple threads to access the same database.
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
