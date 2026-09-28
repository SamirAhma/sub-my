import networkFile from "../data/rail-network.json";
import type { LineId, LineRecord, RailNetworkFile, Station, StationRecord } from "./types";

const raw = networkFile as RailNetworkFile;

function hydrate(file: RailNetworkFile): {
  stations: Station[];
  lines: LineRecord[];
  majorInterchanges: Set<string>;
  transferBufferMinutes: number;
  disclaimer: string;
} {
  const seen = new Set<string>();
  for (const station of file.stations) {
    if (seen.has(station.id)) throw new Error(`Duplicate station ${station.id}`);
    seen.add(station.id);
  }

  const linesOf = new Map<string, LineId[]>();
  const lineIds = new Set<string>();
  for (const line of file.lines) {
    if (lineIds.has(line.id)) throw new Error(`Duplicate line ${line.id}`);
    lineIds.add(line.id);
    const onLine = new Set<string>();
    if (line.stations.length < 2) throw new Error(`${line.id} needs at least two stations`);
    for (const id of line.stations) {
      if (!seen.has(id)) throw new Error(`${line.id} references unknown station ${id}`);
      if (onLine.has(id)) throw new Error(`${line.id} repeats ${id}`);
      onLine.add(id);
      const list = linesOf.get(id) ?? [];
      list.push(line.id);
      linesOf.set(id, list);
    }
  }

  for (const station of file.stations) {
    if (!linesOf.has(station.id)) throw new Error(`Station ${station.id} is not on any line`);
  }

  for (const id of file.majorInterchanges) {
    if ((linesOf.get(id) ?? []).length < 2) {
      throw new Error(`${id} is marked as a major interchange but is not shared by two lines`);
    }
  }

  const stations: Station[] = file.stations.map((station: StationRecord) => ({
    ...station,
    aliases: station.aliases ?? [],
    lines: linesOf.get(station.id) ?? [],
  }));

  return {
    stations,
    lines: file.lines,
    majorInterchanges: new Set(file.majorInterchanges),
    transferBufferMinutes: file.transferBufferMinutes,
    disclaimer: file.disclaimer,
  };
}

const network = hydrate(raw);

export const stations = network.stations;
export const lines = network.lines;
export const majorInterchanges = network.majorInterchanges;
export const transferBufferMinutes = network.transferBufferMinutes;
export const disclaimer = network.disclaimer;

const stationMap = new Map(stations.map((station) => [station.id, station]));
const lineMap = new Map(lines.map((line) => [line.id, line]));
const terminusIds = new Set(lines.flatMap((line) => [line.stations[0], line.stations[line.stations.length - 1]]));

export function getStation(id: string): Station {
  const station = stationMap.get(id);
  if (!station) throw new Error(`Unknown station ${id}`);
  return station;
}

export function getLine(id: LineId): LineRecord {
  const line = lineMap.get(id);
  if (!line) throw new Error(`Unknown line ${id}`);
  return line;
}

export function isTerminus(id: string): boolean {
  return terminusIds.has(id);
}

export function isMajorInterchange(id: string): boolean {
  return majorInterchanges.has(id);
}

export function mapLabel(station: Station): string {
  return station.short ?? station.name;
}

export function lineTitle(id: LineId): string {
  const line = getLine(id);
  return line.mode === "Monorail" ? line.name : `${line.mode} ${line.name}`;
}

export function neighborsOnLine(lineId: LineId, stationId: string): { id: string; minutes: number }[] {
  const line = getLine(lineId);
  const index = line.stations.indexOf(stationId);
  if (index < 0) return [];
  const next: { id: string; minutes: number }[] = [];
  if (index > 0) next.push({ id: line.stations[index - 1], minutes: line.segmentMinutes });
  if (index < line.stations.length - 1) {
    next.push({ id: line.stations[index + 1], minutes: line.segmentMinutes });
  }
  return next;
}

export function searchStations(query: string): Station[] {
  const q = query.trim().toLowerCase();
  const matched = stations.filter((station) => {
    if (!q) return true;
    if (station.name.toLowerCase().includes(q)) return true;
    if ((station.short ?? "").toLowerCase().includes(q)) return true;
    return station.aliases.some((alias) => alias.toLowerCase().includes(q));
  });

  matched.sort((a, b) => {
    if (q) {
      const aStart = a.name.toLowerCase().startsWith(q) || (a.short ?? "").toLowerCase().startsWith(q) ? 0 : 1;
      const bStart = b.name.toLowerCase().startsWith(q) || (b.short ?? "").toLowerCase().startsWith(q) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
    }
    const aHub = a.lines.length > 1 ? 0 : 1;
    const bHub = b.lines.length > 1 ? 0 : 1;
    if (!q && aHub !== bHub) return aHub - bHub;
    return a.name.localeCompare(b.name);
  });

  return matched;
}
