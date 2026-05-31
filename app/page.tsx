import Reader from "./reader";
import seed from "@/data/seed.json";
import type { Book } from "@/lib/schema";

export default function Page() {
  const initial = (seed as { books: Book[] }).books ?? [];
  return <Reader initial={initial} />;
}
