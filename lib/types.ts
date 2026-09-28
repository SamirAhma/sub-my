export type LineId = "kelana" | "ampang" | "kajang" | "putrajaya" | "monorail";

export type LabelAnchor = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type TravelDirection = "forward" | "backward";

export interface StationRecord {
  id: string;
  name: string;
  short?: string;
  x: number;
  y: number;
  anchor?: LabelAnchor;
  label?: boolean;
  aliases?: string[];
}

export interface Station extends StationRecord {
  lines: LineId[];
  aliases: string[];
}

export interface LineRecord {
  id: LineId;
  name: string;
  mode: "LRT" | "MRT" | "Monorail";
  code: string;
  color: string;
  /** Minutes between neighbouring stations on this simplified diagram. */
  segmentMinutes: number;
  /** Typical late-evening interval, used to step back from the last train. */
  headwayMinutes: number;
  /** Last train leaving stations[0], toward the other end. HH:MM, 24h. */
  lastForward: string;
  /** Last train leaving the final station, toward stations[0]. */
  lastBackward: string;
  stations: string[];
}

export interface RailNetworkFile {
  transferBufferMinutes: number;
  majorInterchanges: string[];
  disclaimer: string;
  lines: LineRecord[];
  stations: StationRecord[];
}

export interface RouteSegment {
  lineId: LineId;
  fromId: string;
  toId: string;
}

export interface RideLeg {
  kind: "ride";
  lineId: LineId;
  stopIds: string[];
  direction: TravelDirection;
  towardId: string;
  boardMinutes: number;
  alightMinutes: number;
  rideMinutes: number;
  isLastTrain: boolean;
}

export interface TransferLeg {
  kind: "transfer";
  stationId: string;
  fromLineId: LineId;
  toLineId: LineId;
  bufferMinutes: number;
  waitMinutes: number;
  major: boolean;
  arriveMinutes: number;
  departMinutes: number;
}

export type JourneyLeg = RideLeg | TransferLeg;

export interface JourneyPlan {
  originId: string;
  destinationId: string;
  feasible: boolean;
  reason: string | null;
  departMinutes: number | null;
  arriveMinutes: number | null;
  totalMinutes: number | null;
  inVehicleMinutes: number;
  transferCount: number;
  bufferMinutes: number;
  routesConsidered: number;
  leavingEarlier: boolean;
  originLastTrainMinutes: number | null;
  viaStationIds: string[];
  legs: JourneyLeg[];
  segments: RouteSegment[];
}
