"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import type { Book } from "@/lib/schema";

type PartialArticle = {
  title?: string;
  subtitle?: string;
  reading_time_min?: number;
  body_markdown?: string;
  key_takeaways?: string[];
};

type PartialBook = {
  book_title?: string;
  author?: string;
  source_type?: string;
  category?: string;
  article?: PartialArticle;
};

const PREFETCH_THRESHOLD = 1;
const BATCH_SIZE = 2;
const SEEN_STORAGE_KEY = "curious:seen-titles:v1";
const SEEN_MAX = 200;

// Bias the first session away from the LLM's overused defaults.
const DEFAULT_EXCLUDE = [
  "Atomic Habits",
  "The 7 Habits of Highly Effective People",
  "How to Win Friends and Influence People",
  "The Power of Habit",
];

function loadSeen(initial: Book[]): Set<string> {
  const base = new Set<string>([
    ...DEFAULT_EXCLUDE,
    ...initial.map((b) => b.book_title),
  ]);
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((t) => typeof t === "string" && base.add(t));
    }
  } catch {}
  return base;
}

function persistSeen(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const arr = [...s].slice(-SEEN_MAX);
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export default function Reader({ initial }: { initial: Book[] }) {
  const [queue, setQueue] = useState<Book[]>(initial);
  const [index, setIndex] = useState(0);
  const [seenTitles, setSeenTitles] = useState<Set<string>>(() => loadSeen(initial));
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [streamingBook, setStreamingBook] = useState<PartialBook | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const inflight = useRef(false);
  const latestPartialRef = useRef<PartialBook | null>(null);

  useEffect(() => {
    persistSeen(seenTitles);
  }, [seenTitles]);

  const fetchMore = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: BATCH_SIZE,
          excludeTitles: [...seenTitles].slice(-150),
        }),
      });
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = (await res.json()) as { books: Book[] };
      setSeenTitles((s) => {
        const next = new Set(s);
        data.books.forEach((b) => next.add(b.book_title));
        return next;
      });
      setQueue((prev) => [...prev, ...data.books]);
    } catch {
      setFetchError(true);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [seenTitles]);

  const streamFirst = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setFetchError(false);
    setStreamingBook(null);
    latestPartialRef.current = null;

    try {
      const res = await fetch("/api/cards/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ excludeTitles: [...seenTitles].slice(-150) }),
      });

      if (!res.ok || !res.body) {
        setFetchError(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const partial = JSON.parse(line) as PartialBook;
            latestPartialRef.current = partial;
            setStreamingBook({ ...partial });
          } catch {}
        }
      }

      const finalBook = latestPartialRef.current;
      if (finalBook?.article?.body_markdown) {
        setSeenTitles((s) => {
          const next = new Set(s);
          if (finalBook.book_title) next.add(finalBook.book_title);
          return next;
        });
        setQueue((prev) => [...prev, finalBook as Book]);
        setStreamingBook(null);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      inflight.current = false;
    }
  }, [seenTitles]);

  const fetchTopic = useCallback(
    async (topic: string): Promise<Book | null> => {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: 1,
          topic,
          excludeTitles: [...seenTitles].slice(-100),
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { books: Book[] };
      return data.books?.[0] ?? null;
    },
    [seenTitles]
  );

  const remaining = queue.length - index - 1;

  // On mount with empty seed: stream the first article word-by-word.
  useEffect(() => {
    if (initial.length === 0) streamFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While reading: silently batch-fetch when the queue runs low.
  useEffect(() => {
    if (queue.length > 0 && remaining <= PREFETCH_THRESHOLD) fetchMore();
  }, [remaining, fetchMore, queue.length]);

  const current = queue[index];
  const upNext = queue[index + 1];

  const next = useCallback(() => {
    if (!upNext) return;
    setIndex((i) => i + 1);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, [upNext]);

  const handleSearchResult = useCallback(
    (book: Book) => {
      setSeenTitles((s) => new Set(s).add(book.book_title));
      setQueue((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, book);
        return next;
      });
      setIndex((i) => i + 1);
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    },
    [index]
  );

  return (
    <>
      <ProgressBar />
      <TopBar
        position={index + 1}
        total={queue.length}
        loading={loading}
        onSearch={() => setSearchOpen(true)}
        onRefresh={() => window.location.reload()}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSubmit={fetchTopic}
        onResult={handleSearchResult}
      />

      <main className="relative z-[1] mx-auto w-full max-w-[680px] px-5 pb-32 pt-20 sm:px-8 sm:pt-24">
        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            <motion.article
              key={`${current.book_title}-${index}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <ArticleHeader book={current} />
              <div className="prose-essay mt-10">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {current.article.body_markdown}
                </ReactMarkdown>
              </div>
              <Takeaways items={current.article.key_takeaways} />
              <Footer
                book={current}
                upNext={upNext}
                loading={loading}
                onNext={next}
                onSearch={() => setSearchOpen(true)}
              />
            </motion.article>
          ) : streamingBook ? (
            <StreamingArticle key="streaming" book={streamingBook} />
          ) : (
            <EmptyState
              error={fetchError}
              onRetry={queue.length === 0 ? streamFirst : fetchMore}
            />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

/* ---------- chrome ---------- */

function ProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 30,
    mass: 0.4,
  });
  return <motion.div className="progress-bar" style={{ scaleX, width: "100%" }} />;
}

function TopBar({
  position,
  total,
  loading,
  onSearch,
  onRefresh,
}: {
  position: number;
  total: number;
  loading: boolean;
  onSearch: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--rule)] bg-[color:var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-[color:var(--ink)] text-[12px] font-bold text-[color:var(--paper)]">
            C
          </div>
          <span className="font-display text-[17px] font-semibold tracking-tight text-[color:var(--ink)]">
            Curious
          </span>
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Search" onClick={onSearch}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </IconButton>
          <IconButton label="Refresh" onClick={onRefresh}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
          <span className="ml-2 text-[12px] tabular-nums text-[color:var(--ink-muted)]">
            {loading ? "…" : <>{position}<span className="opacity-60"> / {total}</span></>}
          </span>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--paper-deep)] active:bg-[color:var(--paper-deep)]"
    >
      {children}
    </button>
  );
}

/* ---------- search overlay ---------- */

function SearchOverlay({
  open,
  onClose,
  onSubmit,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (topic: string) => Promise<Book | null>;
  onResult: (book: Book) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery("");
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const book = await onSubmit(q);
      if (!book) {
        setError("Couldn't generate that essay. Try a different angle.");
        return;
      }
      onResult(book);
      onClose();
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const SUGGESTIONS = [
    "how to negotiate",
    "self-motivation",
    "deep focus",
    "managing anxiety",
    "thinking in bets",
    "building habits",
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !submitting && onClose()}
            className="fixed inset-0 z-[60] bg-[color:var(--ink)]/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
            className="fixed inset-x-0 top-0 z-[70] px-4 pt-[max(env(safe-area-inset-top),16px)]"
          >
            <div className="mx-auto max-w-[640px] overflow-hidden rounded-2xl bg-[color:var(--paper)] shadow-[0_30px_80px_-30px_rgba(26,24,20,0.4)] ring-1 ring-[color:var(--rule)]">
              <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[color:var(--ink-muted)]">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What do you want to read about?"
                  disabled={submitting}
                  className="font-display flex-1 bg-transparent text-[18px] font-medium tracking-tight text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)]/70 focus:outline-none"
                />
                {submitting ? (
                  <div className="flex items-center gap-2 text-[12px] text-[color:var(--ink-muted)]">
                    <Spinner />
                    <span className="hidden sm:inline">writing…</span>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="rounded-full bg-[color:var(--ink)] px-4 py-1.5 text-[13px] font-semibold text-[color:var(--paper)] disabled:opacity-30"
                  >
                    Read
                  </button>
                )}
              </form>

              <div className="border-t border-[color:var(--rule)] px-4 py-4">
                {error ? (
                  <div className="text-[13px] text-[color:var(--accent)]">{error}</div>
                ) : submitting ? (
                  <div className="text-[13px] text-[color:var(--ink-muted)]">
                    Drafting your essay — usually 30–60 seconds.
                  </div>
                ) : (
                  <>
                    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
                      Try
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setQuery(s)}
                          className="rounded-full border border-[color:var(--rule)] bg-[color:var(--paper-deep)]/50 px-3 py-1.5 text-[13px] text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--paper-deep)]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------- article parts ---------- */

const SOURCE_LABELS: Record<string, string> = {
  book: "Distilled from",
  research: "Based on research by",
  history: "From history —",
  science: "From science —",
  concept: "Exploring",
  documentary: "Inspired by",
  philosophy: "From philosophy —",
  other: "About",
};

function ArticleHeader({ book }: { book: Book }) {
  const a = book.article;
  const sourceLabel = SOURCE_LABELS[book.source_type ?? "book"] ?? "Distilled from";
  const showAuthor =
    !["history", "science", "philosophy", "other"].includes(book.source_type ?? "book");

  return (
    <header>
      <div className="mb-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        <span className="font-medium text-[color:var(--accent)]">{book.category}</span>
        <span>·</span>
        <span>{a.reading_time_min} min read</span>
      </div>

      <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.022em] text-[color:var(--ink)] sm:text-[52px]">
        {a.title}
      </h1>

      <p className="mt-5 font-serif text-[20px] italic leading-snug text-[color:var(--ink-soft)] sm:text-[22px]">
        {a.subtitle}
      </p>

      <div className="mt-8 flex items-center gap-3 border-y border-[color:var(--rule)] py-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--paper-deep)] font-display text-[15px] font-semibold text-[color:var(--ink)]">
          {initialsOf(book.author)}
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-[color:var(--ink)]">
            {sourceLabel} <em className="font-serif italic">{book.book_title}</em>
          </div>
          {showAuthor && (
            <div className="text-[12.5px] text-[color:var(--ink-muted)]">
              by {book.author}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Takeaways({ items }: { items: string[] }) {
  return (
    <section className="mt-16 rounded-2xl border border-[color:var(--rule)] bg-[color:var(--paper-deep)]/55 p-7">
      <h3 className="font-display text-[14px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        Key Takeaways
      </h3>
      <ul className="mt-4 space-y-3">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3 font-serif text-[17px] leading-snug text-[color:var(--ink)]">
            <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({
  book,
  upNext,
  loading,
  onNext,
  onSearch,
}: {
  book: Book;
  upNext?: Book;
  loading: boolean;
  onNext: () => void;
  onSearch: () => void;
}) {
  return (
    <footer className="mt-16">
      <div className="h-px w-full bg-[color:var(--rule)]" />
      <div className="mt-10 flex flex-col items-center gap-6 text-center">
        <div className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
          You finished “{book.article.title}”
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onNext}
            disabled={!upNext}
            className="group inline-flex items-center gap-3 rounded-full bg-[color:var(--ink)] px-7 py-3.5 text-[15px] font-semibold text-[color:var(--paper)] shadow-[0_18px_40px_-18px_rgba(26,24,20,0.55)] transition-transform duration-200 hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{upNext ? "Read next" : loading ? "Preparing next read…" : "Caught up"}</span>
            {upNext && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="transition-transform group-hover:translate-x-0.5"
              >
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          <button
            onClick={onSearch}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--rule)] bg-[color:var(--paper)] px-5 py-3 text-[14px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--paper-deep)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Read something specific
          </button>
        </div>

        {upNext && (
          <div className="max-w-md">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--ink-muted)]">
              Up next
            </div>
            <div className="mt-1.5 font-display text-[20px] font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
              {upNext.article.title}
            </div>
            <div className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
              {upNext.article.reading_time_min} min · from{" "}
              <em className="font-serif italic">{upNext.book_title}</em>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}

function StreamingArticle({ book }: { book: PartialBook }) {
  const a = book.article;
  const sourceLabel =
    SOURCE_LABELS[(book.source_type as string) ?? "book"] ?? "Distilled from";
  const showAuthor = !["history", "science", "philosophy", "other"].includes(
    (book.source_type as string) ?? "book"
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {/* Skeleton until first fields arrive */}
      {!a?.title && (
        <div className="space-y-5 pt-2">
          <div className="h-3 w-20 animate-pulse rounded bg-[color:var(--rule)]" />
          <div className="h-11 w-3/4 animate-pulse rounded bg-[color:var(--rule)]" />
          <div className="h-6 w-1/2 animate-pulse rounded bg-[color:var(--rule)]" />
        </div>
      )}

      {a?.title && (
        <header>
          <div className="mb-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
            {book.category && (
              <span className="font-medium text-[color:var(--accent)]">{book.category}</span>
            )}
            {book.category && a.reading_time_min && <span>·</span>}
            {a.reading_time_min && <span>{a.reading_time_min} min read</span>}
          </div>

          <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.022em] text-[color:var(--ink)] sm:text-[52px]">
            {a.title}
          </h1>

          {a.subtitle && (
            <p className="mt-5 font-serif text-[20px] italic leading-snug text-[color:var(--ink-soft)] sm:text-[22px]">
              {a.subtitle}
            </p>
          )}

          {book.book_title && (
            <div className="mt-8 flex items-center gap-3 border-y border-[color:var(--rule)] py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--paper-deep)] font-display text-[15px] font-semibold text-[color:var(--ink)]">
                {initialsOf(book.author ?? "?")}
              </div>
              <div className="leading-tight">
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">
                  {sourceLabel} <em className="font-serif italic">{book.book_title}</em>
                </div>
                {showAuthor && book.author && (
                  <div className="text-[12.5px] text-[color:var(--ink-muted)]">
                    by {book.author}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>
      )}

      {a?.body_markdown && (
        <div className="prose-essay mt-10">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body_markdown}</ReactMarkdown>
          <StreamCursor />
        </div>
      )}
    </motion.div>
  );
}

function StreamCursor() {
  return (
    <motion.span
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] rounded-sm bg-[color:var(--ink-muted)]"
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.7, repeat: Infinity, ease: "steps(1, end)" }}
    />
  );
}

function EmptyState({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="font-display text-[28px] font-semibold tracking-tight text-[color:var(--ink)]">
        {error ? "Something went wrong" : "Writing your first read…"}
      </div>
      <p className="max-w-sm text-[15px] text-[color:var(--ink-muted)]">
        {error
          ? "Couldn't generate content right now. Check your connection and try again."
          : "Generating an interesting read for you. This takes about 30–60 seconds."}
      </p>
      {!error && <Spinner />}
      {error && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-full bg-[color:var(--ink)] px-6 py-2.5 text-[14px] font-semibold text-[color:var(--paper)] transition-opacity hover:opacity-80"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="mt-2 flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-[color:var(--ink-muted)]"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}
