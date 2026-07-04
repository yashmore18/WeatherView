# Single-process image for platforms like Koyeb that run one container per
# service and terminate TLS at their own edge (so nginx isn't needed inside
# the container here - see deploy/nginx.conf instead for a self-managed VM).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# services/cache.py's SQLite file lives here - ephemeral is fine, it's a
# cache, not durable storage; losing it on redeploy/restart is the same as
# losing an in-memory cache would be.
RUN mkdir -p /app/instance

ENV PYTHONUNBUFFERED=1

# Koyeb (and most container platforms) inject PORT at runtime; gunicorn.conf.py
# already reads it. Health check hits /healthz (see app.py).
EXPOSE 8000
CMD ["gunicorn", "app:app"]
