import { getLine } from "@/lib/rail-data";
import type { LineId } from "@/lib/types";

const DARK_TEXT = new Set<LineId>(["putrajaya", "monorail"]);

export function LineBadge({ id }: { id: LineId }) {
  const line = getLine(id);
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${
        DARK_TEXT.has(id) ? "text-zinc-950" : "text-white"
      }`}
      style={{ backgroundColor: line.color }}
    >
      {line.code}
    </span>
  );
}

export function LineDots({ ids }: { ids: LineId[] }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {ids.map((id) => (
        <span key={id} className="h-2 w-2 rounded-full ring-1 ring-black/40" style={{ backgroundColor: getLine(id).color }} />
      ))}
    </span>
  );
}
