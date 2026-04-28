# Lerno.ai

AI learning workspace that turns any topic into a focused study session with a video, quick notes, exam questions, and an AI tutor.

## Current App Flow

- No login or signup wall.
- The home route opens the learning dashboard directly.
- Search any topic such as `DBMS`, `SQL joins`, `Computer Networks`, or `OS scheduling`.
- Lerno resolves a YouTube video, prepares revision notes, generates exam questions, and enables tutor follow-ups.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: FastAPI
- AI providers: Gemini and OpenRouter through backend proxy endpoints
- Data: local JSON starter packs with optional Firebase persistence

## Local Setup

### Frontend

```bash
cd /Users/sourav/Downloads/Lerno_AI--main
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

### Backend

```bash
cd /Users/sourav/Downloads/Lerno_AI--main/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```text
http://localhost:8000
```

## Environment Files

Keep secret keys out of Git. `.env`, `.env.local`, and virtual environments are ignored.

### Frontend `.env.local`

Only public client config should be here.

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_YOUTUBE_API_KEY=your_youtube_api_key
```

The YouTube key may be browser-restricted. For local development, allow:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
```

Browser AI provider keys are intentionally disabled by default. Use backend env vars below.
For emergency demos only, you can set `VITE_ENABLE_BROWSER_AI_FALLBACK=true`, but do not use that for production.

### Backend `backend/.env`

Put AI and Firebase secrets here.

```env
GOOGLE_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_TUTOR_MODEL=openai/gpt-4o-mini
OPENROUTER_QUIZ_MODEL=openrouter/auto

ANTHROPIC_API_KEY=your_anthropic_key_optional

FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_STORAGE_BUCKET=your_bucket

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your_email
EMAIL_HOST_PASSWORD=your_app_password
EMAIL_FROM=your_email
```

## Production Notes

- Set backend env variables in Vercel or the backend host.
- Avoid putting AI provider secrets in frontend `VITE_*` variables.
- Redeploy after changing environment variables.
- Rotate any API keys that were exposed in screenshots or commits.

## Useful Commands

```bash
npm run build
npm run lint
```

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## One-Week Launch Checklist

- Perfect the main demo flow: topic search -> video -> notes -> exam questions -> tutor.
- Keep login/signup hidden until the product needs accounts again.
- Move every AI call through backend proxy endpoints.
- Add clear error states for YouTube quota/API-key issues.
- Test on mobile and desktop before deployment.
- Confirm Vercel env variables are set for production.
