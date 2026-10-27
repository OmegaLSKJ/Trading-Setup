"""Local, read-only Kronos inference service for the dashboard.

Set AI_FORECAST_KRONOS_PATH to a clone of https://github.com/shiyu-coder/Kronos.
The service deliberately performs inference only: outcome memory and calibration stay in
the Next.js application so model weights cannot change without an explicit training run.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from typing import Literal

import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Trading Setup Kronos Service", version="1.0.0")

INTERVAL_SECONDS = {"5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "1D": 86400}


class CandlePayload(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class Calibration(BaseModel):
    sampleCount: int = Field(default=0, ge=0, le=100)
    meanError: float = Field(default=0)


class ForecastRequest(BaseModel):
    instrumentKey: str = Field(min_length=1, max_length=100)
    timeframe: Literal["5m", "15m", "30m", "1h", "1D"]
    candles: list[CandlePayload] = Field(min_length=40, max_length=512)
    calibration: Calibration = Field(default_factory=Calibration)

    @field_validator("candles")
    @classmethod
    def chronological_candles(cls, candles: list[CandlePayload]) -> list[CandlePayload]:
        if any(candles[index].time >= candles[index + 1].time for index in range(len(candles) - 1)):
            raise ValueError("Candles must be in strictly ascending time order")
        return candles


def _load_kronos_classes():
    source_path = os.environ.get("AI_FORECAST_KRONOS_PATH")
    if not source_path:
        raise RuntimeError("AI_FORECAST_KRONOS_PATH is not configured")
    if source_path not in sys.path:
        sys.path.insert(0, source_path)
    from model import Kronos, KronosPredictor, KronosTokenizer  # type: ignore
    return Kronos, KronosPredictor, KronosTokenizer


@lru_cache(maxsize=1)
def predictor():
    Kronos, KronosPredictor, KronosTokenizer = _load_kronos_classes()
    tokenizer = KronosTokenizer.from_pretrained(os.getenv("KRONOS_TOKENIZER", "NeoQuasar/Kronos-Tokenizer-2k"))
    model = Kronos.from_pretrained(os.getenv("KRONOS_MODEL", "NeoQuasar/Kronos-mini"))
    return KronosPredictor(model, tokenizer, device=os.getenv("KRONOS_DEVICE", "cpu"), max_context=512)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ready" if os.getenv("AI_FORECAST_KRONOS_PATH") else "not-configured"}


@app.post("/forecast")
def forecast(request: ForecastRequest) -> dict[str, list[dict[str, float | int]]]:
    try:
        model = predictor()
    except Exception as error:  # Configuration errors are returned to the UI, never hidden.
        raise HTTPException(status_code=503, detail=f"Kronos is unavailable: {error}") from error

    frame = pd.DataFrame([candle.model_dump() for candle in request.candles])
    frame["timestamp"] = pd.to_datetime(frame.pop("time"), unit="s", utc=True)
    # Amount is optional in Kronos. Typical-price turnover is a transparent approximation.
    frame["amount"] = ((frame["high"] + frame["low"] + frame["close"]) / 3) * frame["volume"]
    horizon = min(12, max(1, len(frame) // 20))
    interval = INTERVAL_SECONDS[request.timeframe]
    future_timestamps = pd.Series(pd.date_range(frame["timestamp"].iloc[-1] + pd.Timedelta(seconds=interval), periods=horizon, freq=pd.Timedelta(seconds=interval)))
    try:
        prediction = model.predict(
            df=frame[["open", "high", "low", "close", "volume", "amount"]],
            x_timestamp=frame["timestamp"],
            y_timestamp=future_timestamps,
            pred_len=horizon,
            T=0.6,
            top_p=0.9,
            sample_count=3,
            verbose=False,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Kronos inference failed: {error}") from error

    bias = request.calibration.meanError if request.calibration.sampleCount >= 5 else 0.0
    points: list[dict[str, float | int]] = []
    for timestamp, row in prediction.iterrows():
        points.append({
            "time": int(pd.Timestamp(timestamp).timestamp()),
            "open": float(row["open"] + bias), "high": float(row["high"] + bias),
            "low": float(row["low"] + bias), "close": float(row["close"] + bias),
            "volume": float(row.get("volume", 0)),
        })
    return {"points": points}
