import { z } from "zod";

export const CardSchema = z.object({
  insight_text: z
    .string()
    .max(280)
    .describe("Dense, standalone takeaway. Max 280 chars. No fluff."),
  actionable_takeaway: z
    .string()
    .describe("One sentence: a concrete thing the user can do today."),
});

export const BookSchema = z.object({
  book_title: z.string(),
  author: z.string(),
  category: z
    .string()
    .describe(
      "e.g., Psychology, Productivity, Philosophy, Behavioral Economics, Software, Startups, Leadership, Finance, Health"
    ),
  cards: z.array(CardSchema).length(3),
});

export const BatchSchema = z.object({
  books: z.array(BookSchema),
});

export type Card = z.infer<typeof CardSchema>;
export type Book = z.infer<typeof BookSchema>;
export type Batch = z.infer<typeof BatchSchema>;
