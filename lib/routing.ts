import {
  getLine,
  getStation,
  isMajorInterchange,
  lineTitle,
  neighborsOnLine,
  transferBufferMinutes,
} from "./rail-data";
import { formatClock, parseHHMM } from "./time";
import type {
  JourneyLeg,
  JourneyPlan,
  LineId,
  LineRecord,
  RideLeg,
  RouteSegment,
  TravelDirection,
  TransferLeg,
} from "./types";

const SERVICE_START = 5 * 60;
const MAX_TRANSFERS = 3;

interface StructuralRide {
  lineId: LineId;
  stopIds: string[];
}

interface SearchNode {
  stationId: string;
  lineId: LineId | null;
  hasRidden: boolean;
  travel: number;
  search: number;
  transfers: number;
  action: "start" | "board" | "ride" | "transfer";
  parent: SearchNode | null;
}

class MinHeap<T> {
  private items: T[] = [];

  constructor(private less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  push(value: T): void {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(this.items[index], this.items[parent])) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  pop(): T | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (last === undefined || !this.items.length) return top;
    this.items[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.less(this.items[left], this.items[smallest])) smallest = left;
      if (right < this.items.length && this.less(this.items[right], this.items[smallest])) smallest = right;
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
    return top;
  }
}

function directionOf(line: LineRecord, fromId: string, toId: string): TravelDirection {
  const from = line.stations.indexOf(fromId);
  const to = line.stations.indexOf(toId);
  if (from < 0 || to < 0 || from === to) {
    throw new Error(`Cannot ride ${line.id} from ${fromId} to ${toId}`);
  }
  return to > from ? "forward" : "backward";
}

/** Last scheduled departure from a station, following the terminus cutoff plus running time. */
export function lastDepartureMinutes(line: LineRecord, stationId: string, direction: TravelDirection): number {
  const index = line.stations.indexOf(stationId);
  const span = line.stations.length - 1;
  if (direction === "forward") return parseHHMM(line.lastForward) + index * line.segmentMinutes;
  return parseHHMM(line.lastBackward) + (span - index) * line.segmentMinutes;
}

/**
 * Latest departure at or before `deadline`. Trains run every `headway` minutes
 * ending on the last train, so a missed connection steps back to the previous one.
 */
export function latestTrainAtOrBefore(last: number, headway: number, deadline: number): number | null {
  if (deadline >= last) return last;
  const steps = Math.ceil((last - deadline) / headway);
  const candidate = last - steps * headway;
  if (candidate < SERVICE_START) return null;
  return candidate;
}

function stateKey(node: Pick<SearchNode, "stationId" | "lineId" | "hasRidden">): string {
  return `${node.stationId}|${node.lineId ?? "-"}|${node.hasRidden ? 1 : 0}`;
}

function expand(node: SearchNode, transferPenalty: number, banTransferAt?: string): SearchNode[] {
  if (node.lineId === null) {
    return getStation(node.stationId).lines.map((lineId) => ({
      stationId: node.stationId,
      lineId,
      hasRidden: false,
      travel: node.travel,
      search: node.search,
      transfers: node.transfers,
      action: "board" as const,
      parent: node,
    }));
  }

  const next: SearchNode[] = neighborsOnLine(node.lineId, node.stationId).map((edge) => ({
    stationId: edge.id,
    lineId: node.lineId,
    hasRidden: true,
    travel: node.travel + edge.minutes,
    search: node.search + edge.minutes,
    transfers: node.transfers,
    action: "ride" as const,
    parent: node,
  }));

  if (!node.hasRidden || node.transfers >= MAX_TRANSFERS) return next;
  if (banTransferAt && node.stationId === banTransferAt) return next;

  for (const lineId of getStation(node.stationId).lines) {
    if (lineId === node.lineId) continue;
    next.push({
      stationId: node.stationId,
      lineId,
      hasRidden: false,
      travel: node.travel + transferBufferMinutes,
      search: node.search + transferBufferMinutes + transferPenalty,
      transfers: node.transfers + 1,
      action: "transfer",
      parent: node,
    });
  }

  return next;
}

function findPath(originId: string, destinationId: string, transferPenalty: number, banTransferAt?: string): SearchNode | null {
  const start: SearchNode = {
    stationId: originId,
    lineId: null,
    hasRidden: false,
    travel: 0,
    search: 0,
    transfers: 0,
    action: "start",
    parent: null,
  };

  const best = new Map<string, number>();
  const heap = new MinHeap<SearchNode>((a, b) => a.search < b.search || (a.search === b.search && a.transfers < b.transfers));
  best.set(stateKey(start), 0);
  heap.push(start);

  while (heap.size) {
    const node = heap.pop();
    if (!node) break;
    if ((best.get(stateKey(node)) ?? Infinity) < node.search) continue;
    if (node.action === "ride" && node.stationId === destinationId) return node;

    for (const child of expand(node, transferPenalty, banTransferAt)) {
      const key = stateKey(child);
      const previous = best.get(key);
      if (previous !== undefined && previous <= child.search) continue;
      best.set(key, child.search);
      heap.push(child);
    }
  }

  return null;
}

function ridesFromNode(goal: SearchNode): StructuralRide[] {
  const chain: SearchNode[] = [];
  for (let cursor: SearchNode | null = goal; cursor; cursor = cursor.parent) chain.push(cursor);
  chain.reverse();

  const rides: StructuralRide[] = [];
  let index = 0;
  while (index < chain.length) {
    const step = chain[index];
    if (step.action !== "board" && step.action !== "transfer") {
      index += 1;
      continue;
    }
    const lineId = step.lineId;
    if (!lineId) throw new Error("Boarding step is missing a line");
    const stopIds = [step.stationId];
    index += 1;
    while (index < chain.length && chain[index].action === "ride" && chain[index].lineId === lineId) {
      stopIds.push(chain[index].stationId);
      index += 1;
    }
    if (stopIds.length >= 2) rides.push({ lineId, stopIds });
  }
  return rides;
}

function segmentsFromRides(rides: StructuralRide[]): RouteSegment[] {
  return rides.flatMap((ride) =>
    ride.stopIds.slice(0, -1).map((fromId, index) => ({
      lineId: ride.lineId,
      fromId,
      toId: ride.stopIds[index + 1],
    })),
  );
}

function signature(rides: StructuralRide[]): string {
  return rides.map((ride) => `${ride.lineId}:${ride.stopIds.join(">")}`).join("|");
}

interface Scheduled {
  ok: true;
  legs: JourneyLeg[];
  departMinutes: number;
  arriveMinutes: number;
  totalMinutes: number;
  inVehicleMinutes: number;
  transferCount: number;
  leavingEarlier: boolean;
  originLastTrainMinutes: number;
  viaStationIds: string[];
  segments: RouteSegment[];
}

interface Unscheduled {
  ok: false;
  reason: string;
  segments: RouteSegment[];
  viaStationIds: string[];
}

function schedule(rides: StructuralRide[]): Scheduled | Unscheduled {
  const segments = segmentsFromRides(rides);
  const viaStationIds = rides.slice(0, -1).map((ride) => ride.stopIds[ride.stopIds.length - 1]);
  const boards: number[] = [];
  let nextBoard: number | null = null;

  for (let index = rides.length - 1; index >= 0; index -= 1) {
    const ride = rides[index];
    const line = getLine(ride.lineId);
    const direction = directionOf(line, ride.stopIds[0], ride.stopIds[ride.stopIds.length - 1]);
    const rideMinutes = (ride.stopIds.length - 1) * line.segmentMinutes;
    const last = lastDepartureMinutes(line, ride.stopIds[0], direction);
    const deadline = nextBoard === null ? Number.POSITIVE_INFINITY : nextBoard - transferBufferMinutes - rideMinutes;
    const board = latestTrainAtOrBefore(last, line.headwayMinutes, deadline);
    if (board === null) {
      const station = getStation(ride.stopIds[0]);
      const needed = Number.isFinite(deadline) ? ` by ${formatClock(deadline)}` : "";
      return {
        ok: false,
        segments,
        viaStationIds,
        reason: `The last ${lineTitle(ride.lineId)} train from ${station.name} is ${formatClock(last)}. Keeping a ${transferBufferMinutes}-minute transfer means boarding${needed}, before service in this evening model.`,
      };
    }
    boards[index] = board;
    nextBoard = board;
  }

  const legs: JourneyLeg[] = [];
  let inVehicle = 0;

  rides.forEach((ride, index) => {
    const line = getLine(ride.lineId);
    const direction = directionOf(line, ride.stopIds[0], ride.stopIds[ride.stopIds.length - 1]);
    const rideMinutes = (ride.stopIds.length - 1) * line.segmentMinutes;
    const boardMinutes = boards[index];
    const alightMinutes = boardMinutes + rideMinutes;
    const towardId = direction === "forward" ? line.stations[line.stations.length - 1] : line.stations[0];
    const rideLeg: RideLeg = {
      kind: "ride",
      lineId: ride.lineId,
      stopIds: ride.stopIds,
      direction,
      towardId,
      boardMinutes,
      alightMinutes,
      rideMinutes,
      isLastTrain: boardMinutes === lastDepartureMinutes(line, ride.stopIds[0], direction),
    };
    legs.push(rideLeg);
    inVehicle += rideMinutes;

    const following = rides[index + 1];
    if (!following) return;
    const stationId = ride.stopIds[ride.stopIds.length - 1];
    const departMinutes = boards[index + 1];
    const transfer: TransferLeg = {
      kind: "transfer",
      stationId,
      fromLineId: ride.lineId,
      toLineId: following.lineId,
      bufferMinutes: transferBufferMinutes,
      waitMinutes: departMinutes - alightMinutes,
      major: isMajorInterchange(stationId),
      arriveMinutes: alightMinutes,
      departMinutes,
    };
    legs.push(transfer);
  });

  const departMinutes = boards[0];
  const lastRide = legs.filter((leg): leg is RideLeg => leg.kind === "ride").at(-1);
  if (!lastRide) {
    return { ok: false, segments, viaStationIds, reason: "No ride was found on this path." };
  }

  const first = rides[0];
  const firstLine = getLine(first.lineId);
  const firstDirection = directionOf(firstLine, first.stopIds[0], first.stopIds[first.stopIds.length - 1]);
  const originLast = lastDepartureMinutes(firstLine, first.stopIds[0], firstDirection);

  return {
    ok: true,
    legs,
    departMinutes,
    arriveMinutes: lastRide.alightMinutes,
    totalMinutes: lastRide.alightMinutes - departMinutes,
    inVehicleMinutes: inVehicle,
    transferCount: viaStationIds.length,
    leavingEarlier: departMinutes < originLast,
    originLastTrainMinutes: originLast,
    viaStationIds,
    segments,
  };
}

function emptyPlan(originId: string, destinationId: string, reason: string): JourneyPlan {
  return {
    originId,
    destinationId,
    feasible: false,
    reason,
    departMinutes: null,
    arriveMinutes: null,
    totalMinutes: null,
    inVehicleMinutes: 0,
    transferCount: 0,
    bufferMinutes: 0,
    routesConsidered: 0,
    leavingEarlier: false,
    originLastTrainMinutes: null,
    viaStationIds: [],
    legs: [],
    segments: [],
  };
}

function better(a: Scheduled, b: Scheduled): boolean {
  if (a.departMinutes !== b.departMinutes) return a.departMinutes > b.departMinutes;
  if (a.transferCount !== b.transferCount) return a.transferCount < b.transferCount;
  if (a.totalMinutes !== b.totalMinutes) return a.totalMinutes < b.totalMinutes;
  return a.inVehicleMinutes < b.inVehicleMinutes;
}

/**
 * Latest origin departure that still reaches the destination.
 * The last train on each leg is fixed by the terminus cutoff. Where a transfer
 * would miss that train, the search steps back by the line headway until the
 * 5-minute buffer fits. Among a few plausible paths, the later departure wins.
 */
export function planJourney(originId: string, destinationId: string): JourneyPlan {
  if (originId === destinationId) {
    return emptyPlan(originId, destinationId, "Choose two different stations.");
  }

  const primary = findPath(originId, destinationId, 0);
  if (!primary) {
    return emptyPlan(originId, destinationId, "These stations are not connected on the mapped network.");
  }

  const fewest = findPath(originId, destinationId, 45);
  const primaryRides = ridesFromNode(primary);
  const banAt = primaryRides.length > 1 ? primaryRides[0].stopIds[primaryRides[0].stopIds.length - 1] : undefined;
  const alternate = banAt ? findPath(originId, destinationId, 0, banAt) : null;

  const unique = new Map<string, StructuralRide[]>();
  for (const node of [primary, fewest, alternate]) {
    if (!node) continue;
    const rides = ridesFromNode(node);
    unique.set(signature(rides), rides);
  }

  const considered = [...unique.values()];
  const outcomes = considered.map((rides) => ({ rides, result: schedule(rides) }));
  const feasible = outcomes.filter((item): item is { rides: StructuralRide[]; result: Scheduled } => item.result.ok);

  if (!feasible.length) {
    const failed = outcomes[0]?.result;
    return {
      ...emptyPlan(originId, destinationId, failed && !failed.ok ? failed.reason : "No connecting last train."),
      routesConsidered: considered.length,
      segments: failed && !failed.ok ? failed.segments : [],
      viaStationIds: failed && !failed.ok ? failed.viaStationIds : [],
    };
  }

  const best = feasible.reduce((winner, item) => (better(item.result, winner.result) ? item : winner));
  const chosen = best.result;

  return {
    originId,
    destinationId,
    feasible: true,
    reason: null,
    departMinutes: chosen.departMinutes,
    arriveMinutes: chosen.arriveMinutes,
    totalMinutes: chosen.totalMinutes,
    inVehicleMinutes: chosen.inVehicleMinutes,
    transferCount: chosen.transferCount,
    bufferMinutes: chosen.transferCount * transferBufferMinutes,
    routesConsidered: considered.length,
    leavingEarlier: chosen.leavingEarlier,
    originLastTrainMinutes: chosen.originLastTrainMinutes,
    viaStationIds: chosen.viaStationIds,
    legs: chosen.legs,
    segments: chosen.segments,
  };
}
