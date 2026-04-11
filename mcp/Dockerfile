FROM python:3.12-slim

WORKDIR /app

# System dependencies (curl used by healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first — layer-cached until requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source (bind-mounted in dev, so this is primarily for prod builds)
COPY . .

# Warehouse directory (also mounted from host via docker-compose volume)
RUN mkdir -p /data

EXPOSE 8000

CMD ["python", "server.py"]
