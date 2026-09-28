"use client";

import { ArrowLeftRight, CircleDot, Flag, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LineBadge, LineDots } from "@/components/LineBadge";
import { getStation, searchStations } from "@/lib/rail-data";
import type { Station } from "@/lib/types";

const PRESETS: { from: string; to: string; label: string }[] = [
  { from: "klcc", to: "kajang", label: "KLCC → Kajang" },
  { from: "kl-sentral", to: "titiwangsa", label: "Sentral → Titiwangsa" },
  { from: "ampang", to: "kl-sentral", label: "Ampang → Sentral" },
  { from: "subang-jaya", to: "putrajaya-sentral", label: "Subang → Putrajaya" },
];

interface StationSelectorProps {
  originId: string | null;
  destinationId: string | null;
  onOriginChange: (id: string | null) => void;
  onDestinationChange: (id: string | null) => void;
  onSwap: () => void;
}

type Field = "origin" | "destination";

function highlight(name: string, query: string) {
  const q = query.trim();
  if (!q) return name;
  const index = name.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark className="bg-transparent font-semibold text-white">{name.slice(index, index + q.length)}</mark>
      {name.slice(index + q.length)}
    </>
  );
}

export function StationSelector({
  originId,
  destinationId,
  onOriginChange,
  onDestinationChange,
  onSwap,
}: StationSelectorProps) {
  const [open, setOpen] = useState<Field | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = searchStations(open ? query : "");
  const active = results[activeIndex] ?? null;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open || !active) return;
    document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId, open]);

  function commit(field: Field, station: Station) {
    if (field === "origin") onOriginChange(station.id);
    else onDestinationChange(station.id);
    setOpen(null);
    setQuery("");
  }

  function onKeyDown(field: Field, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(field);
      setActiveIndex((index) => Math.min(index + (open === field ? 1 : 0), Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(field);
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open === field && active) {
      event.preventDefault();
      commit(field, active);
      return;
    }
    if (event.key === "Escape") setOpen(null);
  }

  return (
    <div ref={rootRef} className="relative z-20 flex flex-col gap-3">
      <div className="relative">
        <FieldBox
          field="origin"
          label="Departure"
          icon={<CircleDot className="h-4 w-4 text-kelana" aria-hidden />}
          selectedId={originId}
          open={open === "origin"}
          query={query}
          listId={listId}
          activeId={open === "origin" ? (active?.id ?? null) : null}
          onFocus={() => {
            setOpen("origin");
            setQuery("");
            setActiveIndex(0);
          }}
          onChange={(value) => {
            setOpen("origin");
            setQuery(value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => onKeyDown("origin", event)}
          onClear={() => onOriginChange(null)}
        />
        {open === "origin" && (
          <StationList
            field="origin"
            listId={listId}
            query={query}
            results={results}
            activeIndex={activeIndex}
            selectedId={originId}
            onActivate={setActiveIndex}
            onCommit={(station) => commit("origin", station)}
          />
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onSwap}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
          Swap
        </button>
      </div>

      <div className="relative">
        <FieldBox
          field="destination"
          label="Arrival"
          icon={<Flag className="h-4 w-4 text-putrajaya" aria-hidden />}
          selectedId={destinationId}
          open={open === "destination"}
          query={query}
          listId={listId}
          activeId={open === "destination" ? (active?.id ?? null) : null}
          onFocus={() => {
            setOpen("destination");
            setQuery("");
            setActiveIndex(0);
          }}
          onChange={(value) => {
            setOpen("destination");
            setQuery(value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => onKeyDown("destination", event)}
          onClear={() => onDestinationChange(null)}
        />
        {open === "destination" && (
          <StationList
            field="destination"
            listId={listId}
            query={query}
            results={results}
            activeIndex={activeIndex}
            selectedId={destinationId}
            onActivate={setActiveIndex}
            onCommit={(station) => commit("destination", station)}
          />
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((preset) => {
          const activePreset = originId === preset.from && destinationId === preset.to;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onOriginChange(preset.from);
                onDestinationChange(preset.to);
                setOpen(null);
              }}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                activePreset
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:text-white"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StationList({
  field,
  listId,
  query,
  results,
  activeIndex,
  selectedId,
  onActivate,
  onCommit,
}: {
  field: Field;
  listId: string;
  query: string;
  results: Station[];
  activeIndex: number;
  selectedId: string | null;
  onActivate: (index: number) => void;
  onCommit: (station: Station) => void;
}) {
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={field === "origin" ? "Departure stations" : "Arrival stations"}
      className="scroll-thin absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-white/10 bg-[#141924]/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-md"
    >
      {results.length === 0 ? (
        <li className="px-3 py-6 text-center text-sm text-zinc-400">No stations match “{query.trim()}”.</li>
      ) : (
        results.map((station, index) => {
          const selected = selectedId === station.id;
          const current = index === activeIndex;
          return (
            <li key={station.id} role="presentation">
              <button
                id={`${listId}-${station.id}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => onActivate(index)}
                onClick={() => onCommit(station)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${
                  current ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-zinc-100">{highlight(station.name, query)}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {station.lines.map((lineId) => (
                      <LineBadge key={lineId} id={lineId} />
                    ))}
                  </span>
                </span>
                {selected && <span className="text-[10px] uppercase tracking-wider text-zinc-400">Selected</span>}
              </button>
            </li>
          );
        })
      )}
    </ul>
  );
}

function FieldBox({
  field,
  label,
  icon,
  selectedId,
  open,
  query,
  listId,
  activeId,
  onFocus,
  onChange,
  onKeyDown,
  onClear,
}: {
  field: Field;
  label: string;
  icon: ReactNode;
  selectedId: string | null;
  open: boolean;
  query: string;
  listId: string;
  activeId: string | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const inputId = `${field}-station`;
  const selected = selectedId ? getStation(selectedId) : null;
  const value = open ? query : (selected?.name ?? "");

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 focus-within:border-white/30">
      <label htmlFor={inputId} className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeId ? `${listId}-${activeId}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search stations"
          value={value}
          onFocus={onFocus}
          onMouseDown={onFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
        {selected && <LineDots ids={selected.lines} />}
        {selectedId && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
