# Deployment Guide

## Development Environment

### Requirements
- Python 3.11+
- Node.js 18+
- Git

### Backend (Development)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
pip install -r requirements-dev.txt

cp ../.env.example .env
# Edit .env — set DATABASE_URL, ESP32_CONNECTION_TYPE=mock

alembic upgrade head
python scripts/seed_data.py   # Create default robot and servo configs

uvicorn app.main:app --reload --port 8000
```

### Frontend (Development)

```bash
cd frontend
npm install
# Create .env.local:
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
echo "VITE_WS_URL=ws://localhost:8000/ws/live" >> .env.local

npm run dev
```

### Access Points
| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| WebSocket | ws://localhost:8000/ws/live |

---

## Production Environment

### Backend (Production)

```bash
# Using gunicorn + uvicorn workers
pip install gunicorn

gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 2 \
    --bind 0.0.0.0:8000 \
    --log-level info
```

### Frontend (Production Build)

```bash
cd frontend
npm run build
# Serve dist/ with nginx or any static file server
```

### Nginx Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend static files
    location / {
        root /var/www/head_movement/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Migrating from SQLite to PostgreSQL

Only two changes needed:

1. Update `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/head_movement
```

2. Run migrations:
```bash
alembic upgrade head
```

No application code changes required.

---

## Environment Variables Reference

See `.env.example` for complete list.

Critical production settings:
```
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=<long-random-string>
DATABASE_URL=postgresql://...
ESP32_CONNECTION_TYPE=serial  # or wifi
CAMERA_INDEX=0
```

---

## Hardware Setup (Physical ESP32)

1. Flash ESP32 with servo control firmware (separate repo/project)
2. Connect servo signals:
   - Pan servo signal → GPIO 13
   - Tilt servo signal → GPIO 12
   - Servos powered from separate 5V/6V supply
3. Connect ESP32 to PC via USB or Wi-Fi
4. Set `ESP32_CONNECTION_TYPE=serial` or `wifi`
5. Set `ESP32_PORT=COM3` (Windows) or `/dev/ttyUSB0` (Linux)
6. Restart backend

---

## Docker (Future)

Docker configuration will be added in a future phase.
For now, use the manual setup above.

---

## Data Backup

Backup these directories regularly:
```
backend/data/models/trained/
backend/data/datasets/processed/
backend/data/robot.db
```

The `data/` directory is excluded from Git. Back it up separately.
