# Find My Modpack

> AI-powered natural language search for Minecraft modpacks on Modrinth.

Search for modpacks using plain text. The AI understands your request, queries Modrinth, and ranks results with explanations.

## Features

- Natural language search
- 3-phase pipeline: AI parse → Modrinth API → AI rank
- Configurable AI providers (OpenAI, Anthropic, Ollama, OpenRouter, OpenCode, Custom)
- Progressive search broadening on few results
- Category exclusion ("no magic", "no tech")
- Dark theme, responsive design, keyboard shortcuts (Ctrl+K, /, Escape)
- Search history saved in localStorage
- Rate limiting (10 requests/min per IP)
- Request timeouts on AI providers (60s)
- Health check endpoint

## Quick Start

### Prerequisites

- Node.js 18+
- One AI provider API key (OpenAI, Anthropic, Ollama, OpenRouter, OpenCode, or Custom)

### Install

```bash
git clone <url>
cd find-my-modpack
npm install
cp .env.example .env
```

Configure your AI provider in `.env`, then:

```bash
npm start
```

Open http://localhost:3000

## Configuration

| Variable                  | Default      | Description                                              |
|---------------------------|--------------|----------------------------------------------------------|
| PORT                      | 3000         | Server port                                              |
| HOST                      | 127.0.0.1    | Interface to bind to (use `0.0.0.0` to expose on LAN)    |
| ALLOWED_ORIGINS           | —            | Comma-separated origins allowed cross-origin (CORS)      |
| TRUST_PROXY               | —            | Set when behind a reverse proxy so `req.ip` is correct   |
| DEFAULT_PROVIDER_TYPE     | openai       | Provider type                                            |
| DEFAULT_PROVIDER_API_KEY  | —            | API key for the provider                                 |
| DEFAULT_PROVIDER_MODEL    | gpt-4o-mini  | Model name                                               |
| DEFAULT_PROVIDER_BASE_URL | —            | Custom endpoint URL (optional)                           |

Providers can also be configured through the in-app settings UI.

> **Security note:** by default the server binds to `127.0.0.1` and rejects
> cross-origin browser requests. If you put it behind a reverse proxy or expose
> it on a network, set `HOST`, `ALLOWED_ORIGINS`, and `TRUST_PROXY` accordingly.

## Usage

Type a natural language query, for example:

- "magic and tech modpack for 1.20.1 Fabric"
- "hardcore modpack like RLCraft but easier"
- "beginner-friendly modpack with basic addons"
- "industrial modpack with automation"
- "multiplayer modpack to play with friends"
- "magic modpack with RPG quests"
- "popular tech modpack with Create and Mekanism, no magic"
- "something interesting for singleplayer"

## API Endpoints

| Method   | Endpoint                  | Description                          |
|----------|---------------------------|--------------------------------------|
| GET      | /api/health               | Health check                         |
| POST     | /api/search               | Main search                          |
| GET      | /api/search/stream        | SSE streaming search                 |
| GET      | /api/tags                 | Modrinth metadata                    |
| GET      | /api/providers            | List providers (keys masked)         |
| POST     | /api/providers            | Save provider config                 |
| POST     | /api/providers/test       | Test provider connection             |
| PUT      | /api/providers/active     | Set active provider                  |
| DELETE   | /api/providers/:id        | Delete provider config               |

## Security

- Binds to `127.0.0.1` by default; not exposed on the network unless `HOST` is changed
- CORS restricted to same-origin (or an explicit `ALLOWED_ORIGINS` allowlist)
- Provider `baseURL` is validated (http/https only) to limit SSRF
- Output is HTML-escaped and a Content-Security-Policy is enforced
- API keys are masked in responses (`***xxxx`); `config/providers.json` is written with `0600` permissions
- Rate limiting prevents abuse (10 requests/min per IP)
- Prompt length limited to 2000 characters
- AI requests have 60s timeout

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML/CSS/JS
- **Database:** SQLite with FTS5
- **API:** Modrinth API v2
- **AI:** OpenAI, Anthropic, Ollama, OpenRouter, OpenCode, or any OpenAI-compatible endpoint

## License

MIT
