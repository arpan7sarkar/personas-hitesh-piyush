# Persona Chatbot of  hitesh and piyush sir
#Bad attempt


This repository contains a small persona-based chat UI and serverless API routes suitable for Vercel.

Quick deploy steps:

1. Create a Vercel project and point it at this repository.
2. In the Vercel dashboard, set the environment variable `GEMINI_API_KEY` if you have one.
   - If you don't set the key, the `/api/chat` endpoint will return a lightweight mocked reply so the UI is still usable.
3. Deploy — static files are served from `public/` and API routes are in `api/`.

Local development:

1. Copy `.env.example` to `.env` and add your `GEMINI_API_KEY` if you want real model responses.
2. Install dependencies:

```powershell
npm install
```

3. Start the local server for quick testing (serverless functions will run via the `api/` files when you `node server.js`):

```powershell
npm start
```

Notes:
- The serverless functions use a mock response when `GEMINI_API_KEY` is not present so you can test front-end interactions without secrets.
- If you prefer full server mode (not serverless), the original `server.js` is still present.
