# syntax=docker/dockerfile:1
# Base image pinned by digest for reproducible, supply-chain-safe builds.
# Tag: python:3.11-slim
ARG PY_IMAGE=python:3.11-slim@sha256:a3ab0b966bc4e91546a033e22093cb840908979487a9fc0e6e38295747e49ac0

# ---- Builder: compile/install deps into an isolated venv ----
FROM ${PY_IMAGE} AS builder

# Force cache bust - change this value to trigger a full rebuild
ARG CACHE_BUST=2026-05-28-v3

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.server.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefer-binary -r requirements.server.txt

# ---- Runtime: slim image without build toolchain ----
FROM ${PY_IMAGE}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data \
    && useradd -m -s /bin/bash potato

COPY --from=builder /opt/venv /opt/venv

COPY . .

RUN chown -R potato:potato /app /data

ENV PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
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
