"use client";

import { Clock, TrainFront } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NetworkMap } from "@/components/NetworkMap";
import { RouteResult } from "@/components/RouteResult";
import { StationSelector } from "@/components/StationSelector";
import { lines } from "@/lib/rail-data";
import { planJourney } from "@/lib/routing";
import { formatClock, mytMinutesNow } from "@/lib/time";

export default function HomePage() {
  const [originId, setOriginId] = useState<string | null>("klcc");
  const [destinationId, setDestinationId] = useState<string | null>("kajang");
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  const plan = useMemo(
    () => (originId && destinationId ? planJourney(originId, destinationId) : null),
    [originId, destinationId],
  );

  useEffect(() => {
    const tick = () => setNowMinutes(mytMinutesNow());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (destinationId) setSheetOpen(true);
  }, [originId, destinationId]);

  function selectFromMap(id: string) {
    if (!originId || destinationId) {
      setOriginId(id);
      setDestinationId(null);
      return;
    }
    if (id === originId) return;
    setDestinationId(id);
  }

  const hint = !originId
    ? "Tap a station to set your departure."
    : !destinationId
      ? "Tap another station to set your arrival."
      : "Drag to rotate. Scroll to zoom. Right-drag to pan.";

  const clock = nowMinutes === null ? "--:--" : formatClock(nowMinutes);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#planner" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-zinc-950">
        Skip to planner
      </a>
      <header className="shrink-0 border-b border-white/10">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-kelana/20 text-kelana ring-1 ring-kelana/40">
              <TrainFront className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">KL Last Train Finder</h1>
              <p className="truncate text-xs text-zinc-400">Rapid KL · Kelana Jaya, Ampang, Kajang, Putrajaya, Monorail</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
            <span className="font-mono text-zinc-100">{clock}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">MYT</span>
          </div>
        </div>
        <div className="flex h-1">
          {lines.map((line) => (
            <div key={line.id} className="flex-1" style={{ backgroundColor: line.color }} />
          ))}
        </div>
      </header>

      <div id="planner" className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="relative z-30 flex shrink-0 flex-col gap-4 border-white/10 bg-[#07090d] px-4 py-4 lg:z-20 lg:min-h-0 lg:w-[420px] lg:overflow-hidden lg:border-r lg:bg-transparent lg:px-5">
          <StationSelector
            originId={originId}
            destinationId={destinationId}
            onOriginChange={setOriginId}
            onDestinationChange={setDestinationId}
            onSwap={() => {
              setOriginId(destinationId);
              setDestinationId(originId);
            }}
          />
          <div className="scroll-thin hidden min-h-0 flex-1 overflow-y-auto lg:block">
            <RouteResult plan={plan} nowMinutes={nowMinutes} />
          </div>
        </aside>

        <main className="relative min-h-0 flex-1">
          <NetworkMap
            originId={originId}
            destinationId={destinationId}
            segments={plan?.segments ?? []}
            transferIds={plan?.viaStationIds ?? []}
            hint={hint}
            onSelectStation={selectFromMap}
          />

          {plan && (
            <div className="absolute inset-x-0 bottom-0 z-30 lg:hidden">
              <div
                className="flex max-h-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#10141c]/95 shadow-[0_-24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
                style={{
                  transform: `translateY(calc(${sheetOpen ? "0px" : "calc(100% - 6.25rem)"} + ${dragY}px))`,
                  transition: dragging ? "none" : "transform 220ms ease",
                }}
              >
                <button
                  type="button"
                  aria-expanded={sheetOpen}
                  className="flex w-full flex-col items-center px-4 pb-3 pt-2 text-left"
                  onPointerDown={(event) => {
                    dragStart.current = event.clientY;
                    setDragging(true);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (dragStart.current === null) return;
                    setDragY(event.clientY - dragStart.current);
                  }}
                  onPointerUp={(event) => {
                    const dy = dragStart.current === null ? 0 : event.clientY - dragStart.current;
                    dragStart.current = null;
                    setDragging(false);
                    setDragY(0);
                    if (dy > 48) setSheetOpen(false);
                    else if (dy < -48) setSheetOpen(true);
                    else setSheetOpen((open) => !open);
                  }}
                >
                  <span className="mb-2 h-1.5 w-12 rounded-full bg-white/25" />
                  {!sheetOpen && plan.feasible && plan.departMinutes !== null && (
                    <span className="flex w-full items-end justify-between gap-3">
                      <span>
                        <span className="block text-[11px] uppercase tracking-[0.16em] text-zinc-400">Latest departure</span>
                        <span className="font-mono text-2xl text-white">{formatClock(plan.departMinutes)}</span>
                      </span>
                      <span className="pb-1 text-xs text-zinc-400">{plan.totalMinutes !== null ? `${plan.totalMinutes} min` : ""}</span>
                    </span>
                  )}
                  {!sheetOpen && !plan.feasible && <span className="w-full text-sm text-rose-200">No connecting last train</span>}
                  {sheetOpen && <span className="sr-only">Collapse route details</span>}
                </button>
                {sheetOpen && (
                  <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                    <RouteResult plan={plan} nowMinutes={nowMinutes} />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
