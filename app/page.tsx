import SwipeFeed from "./swipe-feed";
import seed from "@/data/seed.json";
import type { Book } from "@/lib/schema";

type FlatCard = {
  id: string;
  book_title: string;
  author: string;
  category: string;
  insight_text: string;
  actionable_takeaway: string;
};

function flatten(books: Book[]): FlatCard[] {
  const out: FlatCard[] = [];
  for (const b of books) {
    b.cards.forEach((c, i) => {
      out.push({
        id: `${b.book_title}-${i}`,
        book_title: b.book_title,
        author: b.author,
        category: b.category,
        insight_text: c.insight_text,
        actionable_takeaway: c.actionable_takeaway,
      });
    });
  }
  // shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Page() {
  const initial = flatten((seed as { books: Book[] }).books);
  return <SwipeFeed initial={initial} />;
}

export type { FlatCard };
