FROM python:3.12-slim

WORKDIR /app
COPY us/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY us/ /app/
EXPOSE 8770
ENV PYTHONUNBUFFERED=1
CMD ["python", "run.py", "--no-browser", "--port", "8770"]
