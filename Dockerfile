FROM python:3.11-slim

# Force cache bust - change this value to trigger a full rebuild
ARG CACHE_BUST=2026-05-28-v3

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gcc \
    g++ \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data \
    && useradd -m -s /bin/bash potato

COPY requirements.server.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.server.txt

COPY . .

RUN chown -R potato:potato /app /data

ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    POTATO_DATA_DIR=/data \
    POTATO_ENABLE_SCHEDULER=true \
    POTATO_CYCLE_MINUTES=3 \
    POTATO_INTEL_ENABLED=true

EXPOSE 8080
USER potato

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/health')" || exit 1

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]