# Build the React frontend
FROM node:20-slim AS web
WORKDIR /web
COPY desktop/frontend/package.json desktop/frontend/package-lock.json ./
RUN npm ci
COPY desktop/frontend/ ./
RUN npm run build

# Build the optional C++ model core (same source as macOS/Windows)
FROM python:3.12-slim AS native
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*
COPY desktop/setup.py ./setup.py
COPY desktop/backend/native.cpp ./backend/native.cpp
RUN pip install --no-cache-dir pybind11 setuptools \
    && python setup.py build_ext --inplace

# Runtime: FastAPI + SQLite (headless, no pywebview)
FROM python:3.12-slim
WORKDIR /app
COPY desktop/requirements-container.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY desktop/backend ./backend
COPY desktop/main.py ./main.py
COPY --from=web /web/dist ./frontend/dist
COPY --from=native /build/backend/_native*.so ./backend/
ENV STOCKDESK_DATA=/data PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8765
CMD ["python", "main.py", "--headless", "--port", "8765", "--host", "0.0.0.0"]
