"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import type { Book } from "@/lib/schema";

const PREFETCH_THRESHOLD = 1; // when only N articles remain after current, fetch more
const BATCH_SIZE = 2;

export default function Reader({ initial }: { initial: Book[] }) {
  const [queue, setQueue] = useState<Book[]>(initial);
  const [index, setIndex] = useState(0);
  const [seenTitles, setSeenTitles] = useState<Set<string>>(
    () => new Set(initial.map((b) => b.book_title))
  );
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  const fetchMore = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: BATCH_SIZE,
          excludeTitles: [...seenTitles].slice(-150),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { books: Book[] };
      setSeenTitles((s) => {
        const next = new Set(s);
        data.books.forEach((b) => next.add(b.book_title));
        return next;
      });
      setQueue((prev) => [...prev, ...data.books]);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [seenTitles]);

  // Prefetch when running low
  const remaining = queue.length - index - 1;
  useEffect(() => {
    if (remaining <= PREFETCH_THRESHOLD) fetchMore();
  }, [remaining, fetchMore]);

  const current = queue[index];
  const upNext = queue[index + 1];

  const next = useCallback(() => {
    if (!upNext) return;
    setIndex((i) => i + 1);
    // Scroll to top after transition
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }, [upNext]);

  return (
    <>
      <ProgressBar />
      <TopBar
        position={index + 1}
        total={queue.length}
        loading={loading}
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
              />
            </motion.article>
          ) : (
            <EmptyState loading={loading} />
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
}: {
  position: number;
  total: number;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--rule)] bg-[color:var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-[color:var(--ink)] text-[12px] font-bold text-[color:var(--paper)]">
            C
          </div>
          <span className="font-display text-[17px] font-semibold tracking-tight text-[color:var(--ink)]">
            Curious
          </span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[color:var(--ink-muted)]">
          {loading && <span className="hidden sm:inline">curating…</span>}
          <span className="tabular-nums">
            {position} <span className="text-[color:var(--ink-muted)]/60">/ {total}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- article parts ---------- */

function ArticleHeader({ book }: { book: Book }) {
  const a = book.article;
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
            Distilled from <em className="font-serif italic">{book.book_title}</em>
          </div>
          <div className="text-[12.5px] text-[color:var(--ink-muted)]">
            by {book.author}
          </div>
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
}: {
  book: Book;
  upNext?: Book;
  loading: boolean;
  onNext: () => void;
}) {
  return (
    <footer className="mt-16">
      <div className="h-px w-full bg-[color:var(--rule)]" />
      <div className="mt-10 flex flex-col items-center gap-6 text-center">
        <div className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--ink-muted)]">
          You finished “{book.article.title}”
        </div>

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

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="font-display text-[28px] font-semibold tracking-tight text-[color:var(--ink)]">
        {loading ? "Curating your first read…" : "No articles yet"}
      </div>
      <p className="max-w-sm text-[15px] text-[color:var(--ink-muted)]">
        {loading
          ? "Our editors are drafting an essay tailored for a curious mind. This takes about a minute."
          : "Run the seeder or hit refresh once content is generated."}
      </p>
      {loading && <Spinner />}
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
