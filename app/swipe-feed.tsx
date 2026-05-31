"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import type { FlatCard } from "./page";
import type { Book } from "@/lib/schema";

/* ---------- palette ---------- */
type Theme = {
  from: string;
  via: string;
  to: string;
  ambient: string;
  ambient2: string;
  accent: string;
};

const THEMES: Theme[] = [
  { from: "#ff6a3d", via: "#ef4444", to: "#7f1d1d", ambient: "rgba(239,68,68,0.22)", ambient2: "rgba(251,146,60,0.14)", accent: "#fecaca" },
  { from: "#a78bfa", via: "#7c3aed", to: "#3b0764", ambient: "rgba(124,58,237,0.22)", ambient2: "rgba(236,72,153,0.14)", accent: "#ddd6fe" },
  { from: "#22d3ee", via: "#0ea5e9", to: "#0c2a6b", ambient: "rgba(14,165,233,0.22)", ambient2: "rgba(45,212,191,0.14)", accent: "#bae6fd" },
  { from: "#fbbf24", via: "#f97316", to: "#7c2d12", ambient: "rgba(249,115,22,0.22)", ambient2: "rgba(251,191,36,0.14)", accent: "#fde68a" },
  { from: "#34d399", via: "#10b981", to: "#064e3b", ambient: "rgba(16,185,129,0.22)", ambient2: "rgba(132,204,22,0.14)", accent: "#a7f3d0" },
  { from: "#f472b6", via: "#db2777", to: "#831843", ambient: "rgba(219,39,119,0.22)", ambient2: "rgba(168,85,247,0.14)", accent: "#fbcfe8" },
  { from: "#94a3b8", via: "#475569", to: "#0f172a", ambient: "rgba(71,85,105,0.22)", ambient2: "rgba(148,163,184,0.10)", accent: "#e2e8f0" },
];

function themeFor(s: string): Theme {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return THEMES[h % THEMES.length];
}

/* ---------- tuning ---------- */
const BATCH_SIZE = 15;
const PREFETCH_WHEN_REMAINING = 5; // after ~10 swipes from a 15-batch

/* ---------- component ---------- */
export default function SwipeFeed({ initial }: { initial: FlatCard[] }) {
  const [stack, setStack] = useState<FlatCard[]>(initial);
  const [doneCount, setDoneCount] = useState(0);
  const [seenTitles, setSeenTitles] = useState<Set<string>>(
    () => new Set(initial.map((c) => c.book_title))
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
      const newCards: FlatCard[] = [];
      for (const b of data.books) {
        b.cards.forEach((c, i) =>
          newCards.push({
            id: `${b.book_title}-${i}-${Date.now()}`,
            book_title: b.book_title,
            author: b.author,
            category: b.category,
            insight_text: c.insight_text,
            actionable_takeaway: c.actionable_takeaway,
          })
        );
      }
      setSeenTitles((s) => {
        const next = new Set(s);
        data.books.forEach((b) => next.add(b.book_title));
        return next;
      });
      setStack((prev) => [...prev, ...newCards]);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [seenTitles]);

  // Prefetch when running low
  useEffect(() => {
    if (stack.length <= PREFETCH_WHEN_REMAINING) fetchMore();
  }, [stack.length, fetchMore]);

  const top = stack[0];
  const next = stack[1];
  const third = stack[2];

  const advance = useCallback(() => {
    setDoneCount((d) => d + 1);
    setStack((s) => s.slice(1));
  }, []);

  const ambient = useMemo(() => (top ? themeFor(top.book_title) : THEMES[0]), [top]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <div
        className="ambient"
        style={
          {
            "--ambient-color": ambient.ambient,
            "--ambient-color-2": ambient.ambient2,
          } as React.CSSProperties
        }
      />

      <div className="relative z-10 mx-auto flex h-full max-w-[440px] flex-col px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <Header done={doneCount} loading={loading} />

        <div className="relative my-4 flex-1 scroll-lock">
          <AnimatePresence initial={false}>
            {third && <CardView key={third.id} card={third} depth={2} />}
            {next && <CardView key={next.id} card={next} depth={1} />}
            {top && (
              <CardView
                key={top.id}
                card={top}
                depth={0}
                onDecide={advance}
              />
            )}
          </AnimatePresence>
          {!top && (
            <div className="absolute inset-0 grid place-items-center text-neutral-500 text-sm">
              {loading ? "Curating your next insight…" : "All caught up"}
            </div>
          )}
        </div>

        <Actions
          disabled={!top}
          onSkip={advance}
          onLike={advance}
        />
      </div>
    </main>
  );
}

/* ---------- header ---------- */
function Header({ done, loading }: { done: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-white/95 to-white/40 grid place-items-center text-black text-[13px] font-bold shadow-[inset_0_-2px_4px_rgba(0,0,0,0.15)]">
          C
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Curious</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] tabular-nums text-neutral-500">
          {loading ? "loading…" : `${done} read`}
        </span>
      </div>
    </div>
  );
}

/* ---------- card ---------- */
function CardView({
  card,
  depth,
  onDecide,
}: {
  card: FlatCard;
  depth: 0 | 1 | 2;
  onDecide?: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-10, 10]);
  const likeOpacity = useTransform(x, [40, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -40], [1, 0]);

  const theme = themeFor(card.book_title);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    if (offset > 110 || velocity > 700 || offset < -110 || velocity < -700) {
      onDecide?.();
    }
  };

  const isTop = depth === 0;

  const layered = {
    scale: 1 - depth * 0.035,
    y: depth * 12,
  };

  return (
    <motion.article
      drag={isTop ? "x" : false}
      dragElastic={0.18}
      dragMomentum={false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={isTop ? onDragEnd : undefined}
      style={
        isTop
          ? { x, rotate, willChange: "transform" }
          : { willChange: "transform" }
      }
      initial={layered}
      animate={layered}
      exit={{
        x: x.get() >= 0 ? 560 : -560,
        rotate: x.get() >= 0 ? 18 : -18,
        opacity: 0,
        transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
      }}
      transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.7 }}
      className={`absolute inset-0 transform-gpu overflow-hidden rounded-[28px] ${
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      {/* gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(155deg, ${theme.from} 0%, ${theme.via} 55%, ${theme.to} 100%)`,
        }}
      />
      {/* top sheen */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.30), transparent 60%)",
        }}
      />
      {/* bottom shadow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0) 42%)",
        }}
      />
      {isTop && <div className="grain" />}
      <div className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/15" />
      {isTop && (
        <div
          className="absolute -inset-2 -z-10 rounded-[36px] opacity-50 blur-2xl"
          style={{ background: theme.via }}
        />
      )}

      {/* content */}
      <div className="relative flex h-full flex-col p-6">
        {/* top row */}
        <div className="relative flex items-center justify-between">
          <span className="rounded-full bg-black/30 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/95 backdrop-blur-sm">
            {card.category}
          </span>
          <motion.span
            style={{ opacity: likeOpacity }}
            className="absolute right-0 top-0 rounded-md border-2 border-emerald-300 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200 rotate-[-8deg]"
          >
            Save
          </motion.span>
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="absolute left-0 top-0 rounded-md border-2 border-white/85 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white rotate-[8deg]"
          >
            Skip
          </motion.span>
        </div>

        {/* insight — the teaching */}
        <div className="mt-5 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p
            className="font-semibold text-white"
            style={{
              fontSize: insightFontSize(card.insight_text),
              lineHeight: 1.22,
              letterSpacing: "-0.015em",
              textShadow: "0 1px 1px rgba(0,0,0,0.18)",
            }}
          >
            {card.insight_text}
          </p>
        </div>

        {/* bottom info */}
        <div className="mt-5 space-y-3.5">
          <div className="rounded-2xl border border-white/15 bg-black/30 p-3.5 backdrop-blur-sm">
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: theme.accent }}
            >
              Try today
            </div>
            <p className="text-[14px] leading-snug text-white/95">
              {card.actionable_takeaway}
            </p>
          </div>

          <div className="flex items-end justify-between">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight text-white">
                {card.book_title}
              </div>
              <div className="truncate text-[12.5px] text-white/70">
                {card.author}
              </div>
            </div>
            <div
              className="h-10 w-7 rounded-sm bg-white/15 ring-1 ring-white/20"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function insightFontSize(text: string): number {
  const len = text.length;
  if (len < 100) return 34;
  if (len < 180) return 28;
  if (len < 280) return 24;
  if (len < 420) return 21;
  return 19;
}

/* ---------- actions ---------- */
function Actions({
  disabled,
  onSkip,
  onLike,
}: {
  disabled: boolean;
  onSkip: () => void;
  onLike: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-5">
      <ActionButton label="Skip" onClick={onSkip} disabled={disabled}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </ActionButton>

      <ActionButton label="Save" onClick={onLike} disabled={disabled} primary>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21s-7.5-4.5-9.5-9.2C1.2 8.3 3.2 5 6.5 5c2 0 3.4 1.1 4.3 2.5h.4C12.1 6.1 13.5 5 15.5 5c3.3 0 5.3 3.3 4 6.8C19.5 16.5 12 21 12 21z" />
        </svg>
      </ActionButton>
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid h-14 w-14 place-items-center rounded-full disabled:opacity-40 disabled:pointer-events-none ${
        primary
          ? "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-[0_12px_32px_-10px_rgba(244,63,94,0.65)]"
          : "bg-white/8 ring-1 ring-white/12 text-white/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.7)] hover:bg-white/14"
      }`}
    >
      {children}
    </motion.button>
  );
}
