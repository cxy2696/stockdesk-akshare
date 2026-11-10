# Build the React frontend
FROM node:20-slim AS web
WORKDIR /web
COPY desktop/frontend/package.json desktop/frontend/package-lock.json ./
RUN npm ci
COPY desktop/frontend/ ./
RUN npm run build

# Runtime: FastAPI + SQLite (headless, no pywebview)
FROM python:3.12-slim
WORKDIR /app
COPY desktop/requirements-container.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY desktop/backend ./backend
COPY desktop/main.py ./main.py
COPY --from=web /web/dist ./frontend/dist
ENV STOCKDESK_DATA=/data PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8765
CMD ["python", "main.py", "--headless", "--port", "8765", "--host", "0.0.0.0"]
