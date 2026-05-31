# Curious

Tinder for book insights — swipe-based micro-learning. Turn doom-scrolling into productive reading.

Built with Next.js 16 (App Router), AI SDK v6, OpenAI, and Framer Motion.

## How it works

- **`/api/cards`** — generates fresh swipeable insights on demand via OpenAI structured output.
- **`scripts/seed.ts`** — one-shot seeder that pre-generates a JSON cache of books + insights into `data/seed.json` so the UI has instant content on first load.
- **`app/swipe-feed.tsx`** — mobile-first swipe stack; fetches more cards from the API as the deck thins.

Each card carries: a ≤280-char tactical insight, a one-sentence "try today" action, and the book/author/category.

## Setup

```bash
npm install
cp .env.example .env
# put your OPENAI_API_KEY in .env

# (optional) pre-generate a seed cache
npm run seed

npm run dev
```

## Deploy

Set `OPENAI_API_KEY` in your Vercel project, then `vercel deploy`.
