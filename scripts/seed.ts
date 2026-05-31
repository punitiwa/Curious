import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BatchSchema, type Book } from "../lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "../lib/prompt";

const TARGET_BOOKS = Number(process.env.SEED_BOOKS ?? 60);
const BATCH_SIZE = 15;
const OUT_DIR = join(process.cwd(), "data");
const OUT_FILE = join(OUT_DIR, "seed.json");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY. Set it in .env or your shell.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const existing: Book[] = existsSync(OUT_FILE)
    ? (JSON.parse(readFileSync(OUT_FILE, "utf8")).books ?? [])
    : [];
  const titles = new Set(existing.map((b) => b.book_title.toLowerCase()));
  const books: Book[] = [...existing];

  console.log(`Starting with ${books.length} books. Target: ${TARGET_BOOKS}.`);

  while (books.length < TARGET_BOOKS) {
    const remaining = TARGET_BOOKS - books.length;
    const count = Math.min(BATCH_SIZE, remaining);
    console.log(`→ Generating batch of ${count}...`);

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: BatchSchema,
      system: SYSTEM_PROMPT,
      prompt: userPrompt({
        count,
        excludeTitles: [...titles],
      }),
      temperature: 0.9,
    });

    let added = 0;
    for (const b of object.books) {
      const key = b.book_title.toLowerCase();
      if (titles.has(key)) continue;
      titles.add(key);
      books.push(b);
      added++;
    }
    console.log(`  added ${added} (total ${books.length})`);

    writeFileSync(OUT_FILE, JSON.stringify({ books }, null, 2));

    if (added === 0) {
      console.log("Model returned only dupes — stopping early.");
      break;
    }
  }

  console.log(`Done. Wrote ${books.length} books to ${OUT_FILE}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
