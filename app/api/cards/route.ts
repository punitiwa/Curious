import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { NextRequest } from "next/server";
import { BatchSchema } from "@/lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topic: string | undefined =
    typeof body.topic === "string" && body.topic.trim() ? body.topic : undefined;
  const defaultCount = topic ? 1 : 2;
  const count = Math.min(Math.max(Number(body.count) || defaultCount, 1), 4);
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
    prompt: userPrompt({ count, excludeTitles, categories, topic }),
    temperature: 0.85,
  });

  return Response.json(object);
}
