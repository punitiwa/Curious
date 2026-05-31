"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import type { FlatCard } from "./page";
import type { Book } from "@/lib/schema";

/* ---------- palette: each gradient pairs with an ambient hue ---------- */
type Theme = {
  from: string;
  via: string;
  to: string;
  ambient: string;
  ambient2: string;
  accent: string;
};

const THEMES: Theme[] = [
  {
    from: "#ff6a3d",
    via: "#ef4444",
    to: "#b91c1c",
    ambient: "rgba(239, 68, 68, 0.22)",
    ambient2: "rgba(251, 146, 60, 0.14)",
    accent: "#fecaca",
  },
  {
    from: "#a78bfa",
    via: "#7c3aed",
    to: "#4c1d95",
    ambient: "rgba(124, 58, 237, 0.22)",
    ambient2: "rgba(236, 72, 153, 0.14)",
    accent: "#ddd6fe",
  },
  {
    from: "#22d3ee",
    via: "#0ea5e9",
    to: "#1e3a8a",
    ambient: "rgba(14, 165, 233, 0.22)",
    ambient2: "rgba(45, 212, 191, 0.14)",
    accent: "#bae6fd",
  },
  {
    from: "#fbbf24",
    via: "#f97316",
    to: "#9a3412",
    ambient: "rgba(249, 115, 22, 0.22)",
    ambient2: "rgba(251, 191, 36, 0.14)",
    accent: "#fde68a",
  },
  {
    from: "#34d399",
    via: "#10b981",
    to: "#064e3b",
    ambient: "rgba(16, 185, 129, 0.22)",
    ambient2: "rgba(132, 204, 22, 0.14)",
    accent: "#a7f3d0",
  },
  {
    from: "#f472b6",
    via: "#db2777",
    to: "#831843",
    ambient: "rgba(219, 39, 119, 0.22)",
    ambient2: "rgba(168, 85, 247, 0.14)",
    accent: "#fbcfe8",
  },
  {
    from: "#94a3b8",
    via: "#475569",
    to: "#0f172a",
    ambient: "rgba(71, 85, 105, 0.22)",
    ambient2: "rgba(148, 163, 184, 0.10)",
    accent: "#e2e8f0",
  },
];

function themeFor(s: string): Theme {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return THEMES[h % THEMES.length];
}

/* ---------- component ---------- */
export default function SwipeFeed({ initial }: { initial: FlatCard[] }) {
  const [stack, setStack] = useState<FlatCard[]>(initial);
  const [history, setHistory] = useState<{ card: FlatCard; liked: boolean }[]>(
    []
  );
  const [seenTitles, setSeenTitles] = useState<Set<string>>(
    () => new Set(initial.map((c) => c.book_title))
  );
  const [loading, setLoading] = useState(false);

  const fetchMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: 5,
          excludeTitles: [...seenTitles].slice(-100),
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
      setLoading(false);
    }
  }, [loading, seenTitles]);

  useEffect(() => {
    if (stack.length < 4) fetchMore();
  }, [stack.length, fetchMore]);

  const top = stack[0];
  const next = stack[1];
  const third = stack[2];

  const advance = (liked: boolean) => {
    if (!top) return;
    setHistory((h) => [...h, { card: top, liked }]);
    setStack((s) => s.slice(1));
  };

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

      {/* Mobile frame on desktop */}
      <div className="relative z-10 mx-auto flex h-full max-w-[420px] flex-col px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
        <Header total={history.length + stack.length} done={history.length} loading={loading} />

        <div className="relative my-4 flex-1">
          <AnimatePresence initial={false}>
            {third && <CardView key={third.id} card={third} depth={2} />}
            {next && <CardView key={next.id} card={next} depth={1} />}
            {top && (
              <CardView
                key={top.id}
                card={top}
                depth={0}
                onDecide={(liked) => advance(liked)}
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
          onSkip={() => advance(false)}
          onLike={() => advance(true)}
        />
      </div>
    </main>
  );
}

/* ---------- header ---------- */
function Header({
  total,
  done,
  loading,
}: {
  total: number;
  done: number;
  loading: boolean;
}) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-white/90 to-white/40 grid place-items-center text-black text-xs font-bold">
          C
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Curious</span>
      </div>
      <div className="ml-2 flex-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full bg-white/70"
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>
      <span className="text-[11px] tabular-nums text-neutral-500">
        {loading ? "…" : `${done}/${total}`}
      </span>
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
  onDecide?: (liked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-12, 12]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -40], [1, 0]);

  const theme = themeFor(card.book_title);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    if (offset > 110 || velocity > 600) onDecide?.(true);
    else if (offset < -110 || velocity < -600) onDecide?.(false);
  };

  const layered = {
    scale: 1 - depth * 0.04,
    y: depth * 14,
    opacity: depth === 2 ? 0.5 : 1,
  };

  const isTop = depth === 0;

  return (
    <motion.article
      drag={isTop ? "x" : false}
      dragElastic={0.6}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={isTop ? onDragEnd : undefined}
      style={isTop ? { x, rotate } : undefined}
      initial={{ ...layered, opacity: 0 }}
      animate={{ ...layered, opacity: layered.opacity }}
      exit={{
        x: x.get() > 0 ? 520 : -520,
        rotate: x.get() > 0 ? 20 : -20,
        opacity: 0,
        transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
      }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className={`absolute inset-0 overflow-hidden rounded-[28px] ${
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
      {/* inner highlight */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.35), transparent 60%)",
        }}
      />
      {/* deep shadow at bottom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 45%)",
        }}
      />
      <div className="grain" />
      {/* outline */}
      <div className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/15" />
      {/* outer shadow via filter */}
      <div
        className="absolute -inset-1 -z-10 rounded-[32px] blur-2xl opacity-60"
        style={{ background: theme.via }}
      />

      {/* content */}
      <div className="relative flex h-full flex-col justify-between p-7">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-black/30 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/90 backdrop-blur">
            {card.category}
          </span>
          <motion.span
            style={{ opacity: likeOpacity }}
            className="rounded-md border-2 border-emerald-300 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200 rotate-[-8deg]"
          >
            Save
          </motion.span>
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="absolute right-7 top-7 rounded-md border-2 border-white/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white rotate-[8deg]"
          >
            Skip
          </motion.span>
        </div>

        <div className="-mt-4">
          <div
            className="font-serif text-white/40 leading-none"
            style={{ fontSize: 96, marginBottom: -12 }}
          >
            “
          </div>
          <p
            className="font-serif text-white leading-[1.12] tracking-tight"
            style={{
              fontSize: insightFontSize(card.insight_text),
              textShadow: "0 1px 1px rgba(0,0,0,0.15)",
            }}
          >
            {card.insight_text}
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/15 bg-black/25 p-3.5 backdrop-blur">
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: theme.accent }}
            >
              Try today
            </div>
            <p className="text-[13.5px] leading-snug text-white/95">
              {card.actionable_takeaway}
            </p>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-[15px] font-semibold leading-tight text-white">
                {card.book_title}
              </div>
              <div className="text-[12px] text-white/70">{card.author}</div>
            </div>
            <div className="h-10 w-7 rounded-sm bg-white/15 backdrop-blur ring-1 ring-white/20" aria-hidden />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function insightFontSize(text: string): number {
  const len = text.length;
  if (len < 90) return 30;
  if (len < 140) return 26;
  if (len < 200) return 22;
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
      <ActionButton
        label="Skip"
        onClick={onSkip}
        disabled={disabled}
        className="text-white/80"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </ActionButton>

      <ActionButton
        label="Save"
        onClick={onLike}
        disabled={disabled}
        primary
      >
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
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid h-14 w-14 place-items-center rounded-full disabled:opacity-40 disabled:pointer-events-none transition-shadow ${
        primary
          ? "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-[0_10px_30px_-8px_rgba(244,63,94,0.6)]"
          : `glass shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] ${className}`
      }`}
    >
      {children}
    </motion.button>
  );
}
