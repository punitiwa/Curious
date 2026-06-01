import { z } from "zod";

export const ArticleSchema = z.object({
  title: z
    .string()
    .describe("Compelling article title. Not the book title — a magazine-style headline."),
  subtitle: z
    .string()
    .describe("One-line deck/dek beneath the title. The promise of the piece."),
  reading_time_min: z
    .number()
    .int()
    .min(8)
    .max(18)
    .describe("Estimated reading time in minutes (target 10–15)."),
  body_markdown: z
    .string()
    .min(1500)
    .describe(
      "Long-form essay in markdown. ~1500–2500 words. Use ## section headings, paragraphs, occasional > blockquote for emphasis, and - bullet lists sparingly. NO h1; the title is rendered separately."
    ),
  key_takeaways: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3–5 single-sentence takeaways the reader should leave with."),
});

export const BookSchema = z.object({
  book_title: z
    .string()
    .describe(
      "The title of the source — could be a book title, name of a study/experiment, historical event, concept, documentary, or topic."
    ),
  author: z
    .string()
    .describe(
      "Author, researcher, key figure, or originator. For historical events use the main figure; for concepts use the thinker who defined it."
    ),
  source_type: z
    .enum(["book", "research", "history", "science", "concept", "documentary", "philosophy", "other"])
    .default("book")
    .describe("The type of source this piece is based on."),
  category: z
    .string()
    .describe(
      "e.g., Psychology, Philosophy, History, Science, Technology, Economics, Creativity, Health, Communication, Mathematics, Nature, Society"
    ),
  article: ArticleSchema,
});

export const BatchSchema = z.object({
  books: z.array(BookSchema),
});

export type Article = z.infer<typeof ArticleSchema>;
export type Book = z.infer<typeof BookSchema>;
export type Batch = z.infer<typeof BatchSchema>;
