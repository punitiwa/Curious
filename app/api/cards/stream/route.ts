import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { NextRequest } from "next/server";
import { BookSchema } from "@/lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topic: string | undefined =
    typeof body.topic === "string" && body.topic.trim() ? body.topic : undefined;
  const excludeTitles: string[] = Array.isArray(body.excludeTitles)
    ? body.excludeTitles.slice(0, 200)
    : [];

  try {
    const result = streamObject({
      model: openai.chat("gpt-4o-mini"),
      schema: BookSchema,
      system: SYSTEM_PROMPT,
      prompt: userPrompt({ count: 1, excludeTitles, topic }),
      temperature: 0.85,
    });

    // Emit partial objects as newline-delimited JSON so the client can
    // progressively render content without any special stream parser.
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const partial of result.partialObjectStream) {
            controller.enqueue(encoder.encode(JSON.stringify(partial) + "\n"));
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("streamObject failed:", err);
    return Response.json({ error: "Failed to generate content" }, { status: 500 });
  }
}
