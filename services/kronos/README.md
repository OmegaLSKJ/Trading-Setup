# Kronos inference service

This is a local, inference-only adapter for the optional dashboard overlay. It does not
place orders or update Kronos weights. The dashboard stores completed forecast outcomes
and supplies a small, auditable calibration bias only after five validated outcomes.

1. Clone Kronos outside this repository, for example:
   `git clone https://github.com/shiyu-coder/Kronos.git C:\tools\Kronos`
2. Create and activate a Python 3.10+ virtual environment in this directory.
3. Install `pip install -r requirements.txt`.
4. Set `AI_FORECAST_KRONOS_PATH=C:\tools\Kronos` and run:
   `uvicorn app:app --host 127.0.0.1 --port 8010`

The Next.js app uses `AI_FORECAST_SERVICE_URL` when the service runs on a non-default URL.
