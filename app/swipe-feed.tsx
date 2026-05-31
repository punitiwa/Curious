"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import type { FlatCard } from "./page";
import type { Book } from "@/lib/schema";

const PALETTE = [
  "from-rose-500 to-orange-500",
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-emerald-500",
  "from-amber-500 to-red-500",
  "from-indigo-500 to-cyan-500",
  "from-emerald-500 to-lime-500",
];

function gradientFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function SwipeFeed({ initial }: { initial: FlatCard[] }) {
  const [stack, setStack] = useState<FlatCard[]>(initial);
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

  const advance = () => setStack((s) => s.slice(1));

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-between p-4 pt-6 pb-8 select-none">
      <header className="w-full max-w-md flex items-center justify-between text-sm text-neutral-400">
        <span className="font-semibold tracking-tight text-neutral-100">Curious</span>
        <span>{loading ? "loading…" : `${stack.length} left`}</span>
      </header>

      <div className="relative w-full max-w-md aspect-[3/4]">
        <AnimatePresence initial={false}>
          {next && <CardView key={next.id} card={next} behind />}
          {top && <CardView key={top.id} card={top} onSwipe={advance} />}
        </AnimatePresence>
        {!top && (
          <div className="absolute inset-0 grid place-items-center text-neutral-500">
            {loading ? "Loading insights…" : "Tap to load more"}
          </div>
        )}
      </div>

      <footer className="w-full max-w-md flex items-center justify-center gap-6">
        <button
          onClick={advance}
          className="h-14 w-14 rounded-full bg-neutral-900 border border-neutral-800 text-2xl active:scale-95 transition"
          aria-label="Skip"
        >
          ✕
        </button>
        <button
          onClick={advance}
          className="h-14 w-14 rounded-full bg-rose-500 text-2xl active:scale-95 transition"
          aria-label="Save"
        >
          ♥
        </button>
      </footer>
    </main>
  );
}

function CardView({
  card,
  onSwipe,
  behind,
}: {
  card: FlatCard;
  onSwipe?: () => void;
  behind?: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const gradient = gradientFor(card.book_title);

  return (
    <motion.div
      drag={behind ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      style={behind ? undefined : { x, rotate, opacity }}
      initial={behind ? { scale: 0.95, y: 12 } : { scale: 1, y: 0 }}
      animate={behind ? { scale: 0.95, y: 12 } : { scale: 1, y: 0 }}
      exit={{ x: x.get() > 0 ? 400 : -400, opacity: 0, transition: { duration: 0.2 } }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 120) onSwipe?.();
      }}
      className={`absolute inset-0 rounded-3xl p-6 flex flex-col justify-between shadow-2xl bg-gradient-to-br ${gradient} ${
        behind ? "pointer-events-none" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="flex items-center justify-between text-white/80 text-xs uppercase tracking-widest">
        <span className="px-2 py-1 rounded-full bg-black/25 backdrop-blur">
          {card.category}
        </span>
      </div>

      <p className="text-white text-2xl leading-snug font-semibold drop-shadow-sm">
        {card.insight_text}
      </p>

      <div className="space-y-3">
        <div className="rounded-xl bg-black/30 backdrop-blur p-3 text-white/90 text-sm">
          <div className="text-[10px] uppercase tracking-widest text-white/60 mb-1">
            Try today
          </div>
          {card.actionable_takeaway}
        </div>
        <div className="text-white/90 text-sm">
          <div className="font-semibold">{card.book_title}</div>
          <div className="text-white/70 text-xs">{card.author}</div>
        </div>
      </div>
    </motion.div>
  );
}
