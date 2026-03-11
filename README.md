# SlabCalc — AI Pokémon Card Grader

Upload photos of your Pokémon cards and get instant AI-powered grade estimates across **PSA, BGS, CGC, and ACE** with current market prices for each grade tier.

---

## Quick Start

### 1. Install dependencies
```
npm install
```

### 2. Add your Anthropic API key
Open `.env.local` and replace the placeholder:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Get your key at https://console.anthropic.com

### 3. Run locally
```
npm run dev
```
Then open http://localhost:3000

---

## Deploy to Vercel

1. Push to a GitHub repo
2. Import the repo in Vercel
3. Add `ANTHROPIC_API_KEY` as an environment variable in Vercel project settings
4. Deploy

**Note for PowerShell users** — run commands separately (no `&&`):
```
npm install
npm run dev
```

---

## How It Works

1. User uploads front (and optionally back) card photo
2. Images are base64 encoded in the browser
3. Sent to `/api/grade` — a Next.js serverless function
4. The API route calls Claude claude-opus-4-5 with vision capability
5. Claude identifies the card, scores each condition sub-category, and returns grade estimates + market prices for all 4 grading companies
6. Results are rendered with animated ROI bars and a best-pick recommendation

---

## Stack
- **Next.js 14** (Pages Router)
- **Anthropic SDK** (`@anthropic-ai/sdk`)
- **Vercel** for deployment
- No database needed — stateless per request
