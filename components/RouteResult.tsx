import { AlertTriangle, ArrowRight, Clock3, Info, TrainFront } from "lucide-react";
import { LineBadge } from "@/components/LineBadge";
import { disclaimer, getLine, getStation, lineTitle } from "@/lib/rail-data";
import { departureHasPassed, formatClock, formatDuration, isNextDay } from "@/lib/time";
import type { JourneyPlan, RideLeg, TransferLeg } from "@/lib/types";

interface RouteResultProps {
  plan: JourneyPlan | null;
  nowMinutes: number | null;
}

export function RouteResult({ plan, nowMinutes }: RouteResultProps) {
  if (!plan) {
    return (
      <div className="flex h-full min-h-48 flex-col items-start justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8">
        <TrainFront className="mb-3 h-6 w-6 text-kelana" aria-hidden />
        <h2 className="text-base font-semibold text-white">Plan a last train</h2>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-400">
          Choose a departure and an arrival, or tap a station on the map. The latest evening departure is calculated with a 5-minute interchange buffer.
        </p>
      </div>
    );
  }

  const origin = getStation(plan.originId);
  const destination = getStation(plan.destinationId);

  if (!plan.feasible || plan.departMinutes === null || plan.arriveMinutes === null || plan.totalMinutes === null) {
    return (
      <article className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4" aria-live="polite">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-200">No connecting last train</p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          {origin.name} <ArrowRight className="mx-1 inline h-4 w-4" aria-hidden /> {destination.name}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-rose-50">{plan.reason}</p>
        {plan.viaStationIds.length > 0 && (
          <p className="mt-3 text-sm text-rose-100/80">Via {plan.viaStationIds.map((id) => getStation(id).name).join(" · ")}</p>
        )}
      </article>
    );
  }

  const rides = plan.legs.filter((leg): leg is RideLeg => leg.kind === "ride");
  const firstRide = rides[0];
  const passed = nowMinutes !== null && departureHasPassed(plan.departMinutes, nowMinutes);
  const firstLine = firstRide ? getLine(firstRide.lineId) : null;

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30" aria-live="polite">
      <div className="flex h-1.5 overflow-hidden rounded-t-3xl">
        {rides.map((ride) => (
          <div key={`${ride.lineId}-${ride.stopIds[0]}`} style={{ backgroundColor: getLine(ride.lineId).color, flex: ride.rideMinutes }} />
        ))}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Latest departure</p>
            <p className="mt-1 font-mono text-4xl font-medium tracking-tight text-white">{formatClock(plan.departMinutes)}</p>
            <p className="mt-1 text-sm text-zinc-300">
              {origin.name}
              <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-zinc-500" aria-hidden />
              {destination.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {passed ? (
              <span className="rounded-full bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-rose-200">Passed in MYT</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200">Still ahead in MYT</span>
            )}
            {firstRide?.isLastTrain && (
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-zinc-200">Last train</span>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Journey" value={formatDuration(plan.totalMinutes)} />
          <Stat label="On board" value={formatDuration(plan.inVehicleMinutes)} />
          <Stat label="Transfers" value={plan.transferCount === 0 ? "Direct" : String(plan.transferCount)} />
        </dl>

        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-200">
          <Clock3 className="h-4 w-4 text-zinc-400" aria-hidden />
          Arrive {formatClock(plan.arriveMinutes)}
          {isNextDay(plan.arriveMinutes) && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-zinc-300">next day</span>}
          <span className="text-zinc-500">· {formatDuration(plan.totalMinutes)}</span>
        </p>

        {plan.leavingEarlier && plan.originLastTrainMinutes !== null && firstRide && (
          <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm leading-relaxed text-amber-50">
            The last {lineTitle(firstRide.lineId)} train from {origin.name} is {formatClock(plan.originLastTrainMinutes)}. Leave at{" "}
            {formatClock(plan.departMinutes)} so every interchange still has a 5-minute buffer.
          </p>
        )}

        {!plan.leavingEarlier && firstRide?.isLastTrain && (
          <p className="mt-3 text-sm text-zinc-400">This is the last {firstLine ? lineTitle(firstRide.lineId) : "train"} departure from {origin.name} that still reaches {destination.name}.</p>
        )}

        <ol className="mt-5 space-y-3">
          {plan.legs.map((leg, index) =>
            leg.kind === "ride" ? (
              <RideStep key={`${leg.lineId}-${leg.stopIds[0]}-${index}`} leg={leg} />
            ) : (
              <TransferStep key={`${leg.stationId}-${index}`} leg={leg} />
            ),
          )}
        </ol>

        {plan.routesConsidered > 1 && (
          <p className="mt-4 text-xs text-zinc-500">Latest departure among {plan.routesConsidered} evening paths.</p>
        )}

        <details className="mt-4 text-xs leading-relaxed text-zinc-500">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-zinc-400">
            <Info className="h-3.5 w-3.5" aria-hidden />
            How these times are estimated
          </summary>
          <p className="mt-2">{disclaimer}</p>
        </details>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 px-2 py-2 text-center">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs leading-tight text-white sm:text-sm">{value}</dd>
    </div>
  );
}

function RideStep({ leg }: { leg: RideLeg }) {
  const line = getLine(leg.lineId);
  const from = getStation(leg.stopIds[0]);
  const to = getStation(leg.stopIds[leg.stopIds.length - 1]);
  const toward = getStation(leg.towardId);
  const between = leg.stopIds.slice(1, -1);
  const stopCount = leg.stopIds.length - 1;

  return (
    <li className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: line.color, boxShadow: `0 0 10px ${line.color}` }} />
          <div>
            <p className="text-sm font-medium text-white">{lineTitle(leg.lineId)}</p>
            <p className="text-xs text-zinc-400">toward {toward.name}</p>
          </div>
        </div>
        <LineBadge id={leg.lineId} />
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
        <span className="font-mono text-zinc-100">{formatClock(leg.boardMinutes)}</span>
        <span className="text-zinc-300">Board at {from.name}</span>
        {leg.isLastTrain ? (
          <span className="justify-self-end text-[10px] uppercase tracking-wider text-zinc-400">Last</span>
        ) : (
          <span className="justify-self-end text-[10px] uppercase tracking-wider text-zinc-500">Earlier</span>
        )}
      </div>
      <p className="mt-1 pl-[4.5rem] text-xs text-zinc-500">
        {stopCount} {stopCount === 1 ? "stop" : "stops"} · {formatDuration(leg.rideMinutes)}
      </p>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
        <span className="font-mono text-zinc-100">{formatClock(leg.alightMinutes)}</span>
        <span className="text-zinc-300">Alight at {to.name}</span>
      </div>
      {between.length > 0 && (
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer text-zinc-400">Stations in between</summary>
          <p className="mt-1 leading-relaxed">{between.map((id) => getStation(id).name).join(" · ")}</p>
        </details>
      )}
    </li>
  );
}

function TransferStep({ leg }: { leg: TransferLeg }) {
  const station = getStation(leg.stationId);
  const extra = leg.waitMinutes - leg.bufferMinutes;
  const tone = leg.major
    ? "border-amber-300/35 bg-amber-300/10 text-amber-50"
    : "border-white/10 bg-white/[0.03] text-zinc-300";

  return (
    <li className={`flex gap-2 rounded-2xl border px-3 py-2.5 text-sm leading-relaxed ${tone}`}>
      {leg.major && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />}
      <p>
        {leg.major ? `${station.name} interchange.` : `Change at ${station.name}.`} Allow at least {leg.bufferMinutes} minutes
        before the {lineTitle(leg.toLineId)}, which leaves at {formatClock(leg.departMinutes)}.
        {extra > 0
          ? ` You arrive at ${formatClock(leg.arriveMinutes)} and wait ${leg.waitMinutes} min, including the buffer.`
          : " That is right at the end of the buffer."}
      </p>
    </li>
  );
}
