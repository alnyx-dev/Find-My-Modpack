# Find My Modpack

> AI-powered natural language search for Minecraft modpacks on Modrinth.

Search for modpacks using plain text. The AI understands your request, queries Modrinth, and ranks results with explanations.

## Features

- Natural language search
- 3-phase pipeline: AI parse → Modrinth API → AI rank
- Configurable AI providers (OpenAI, Anthropic, Ollama, OpenRouter, Custom)
- Progressive search broadening on few results
- Dark theme, responsive design, keyboard shortcuts (Ctrl+K, /, Escape)
- Search history saved in localStorage

## Quick Start

### Prerequisites

- Node.js 18+
- One AI provider API key (OpenAI, Anthropic, Ollama, or OpenRouter)

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

| Variable                  | Default      | Description                     |
|---------------------------|--------------|---------------------------------|
| PORT                      | 3000         | Server port                     |
| DEFAULT_PROVIDER_TYPE     | openai       | Provider type                   |
| DEFAULT_PROVIDER_API_KEY  | —            | API key for the provider        |
| DEFAULT_PROVIDER_MODEL    | gpt-4o-mini  | Model name                      |
| DEFAULT_PROVIDER_BASE_URL | —            | Custom endpoint URL (optional)  |

Providers can also be configured through the in-app settings UI.

## Usage

Type a natural language query, for example:

- "magic and tech modpack for 1.20.1 Fabric"
- "hardcore modpack like RLCraft but easier"
- "beginner-friendly modpack with basic addons"
- "industrial modpack with automation"
- "multiplayer modpack to play with friends"
- "magic modpack with RPG quests"

## API Endpoints

| Method   | Endpoint                  | Description              |
|----------|---------------------------|--------------------------|
| POST     | /api/search               | Main search              |
| GET      | /api/search/stream        | SSE streaming search     |
| GET      | /api/tags                 | Modrinth metadata        |
| GET      | /api/providers            | List providers           |
| POST     | /api/providers            | Save provider config     |
| POST     | /api/providers/test       | Test provider connection |
| PUT      | /api/providers/active     | Set active provider      |
| DELETE   | /api/providers/:id        | Delete provider config   |

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML/CSS/JS
- **API:** Modrinth API v2
- **AI:** OpenAI, Anthropic, Ollama, OpenRouter, or any OpenAI-compatible endpoint

## License

MIT
