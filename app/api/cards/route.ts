import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { NextRequest } from "next/server";
import { BatchSchema } from "@/lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 20);
  const excludeTitles: string[] = Array.isArray(body.excludeTitles)
    ? body.excludeTitles.slice(0, 200)
    : [];
  const categories: string[] | undefined = Array.isArray(body.categories)
    ? body.categories
    : undefined;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: BatchSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt({ count, excludeTitles, categories }),
    temperature: 0.8,
  });

  return Response.json(object);
}
