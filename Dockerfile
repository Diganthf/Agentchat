FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Use clean deploy config if no config.json exists
RUN if [ ! -f config.json ]; then cp config.deploy.json config.json; fi

ENV PORT=5050
ENV HOST=0.0.0.0
EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5050/api/health')" || exit 1

CMD ["python", "server.py"]
