FROM python:3.11-slim

# System dependencies: ffmpeg, exiftool, imagemagick, curl (for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libimage-exiftool-perl \
    imagemagick \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Copy application code and startup script
COPY clipmind/ clipmind/
COPY start.sh ./
RUN chmod +x start.sh

# Create data directory for SQLite and thumbnails
RUN mkdir -p data/thumbnails/converted

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["./start.sh"]
