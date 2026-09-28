/** Parse HH:MM. Hours may be 24 so a cutoff just after midnight stays unambiguous. */
export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Bad time ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 30 || minute > 59) throw new Error(`Bad time ${value}`);
  return hour * 60 + minute;
}

export function isNextDay(minutes: number): boolean {
  return minutes >= 24 * 60;
}

export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export function mytMinutesNow(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Evening departures are compared in one service night, so 12:30 AM is after 11:50 PM. */
export function departureHasPassed(departMinutes: number, nowMinutes: number): boolean {
  const now = nowMinutes < 4 * 60 ? nowMinutes + 1440 : nowMinutes;
  return now > departMinutes;
}
