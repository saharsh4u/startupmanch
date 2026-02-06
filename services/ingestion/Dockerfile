FROM python:3.11-slim

WORKDIR /app

COPY services /app/services

RUN pip install --no-cache-dir -r /app/services/ingestion/requirements.txt \
    && playwright install --with-deps chromium

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "services.ingestion.worker"]
