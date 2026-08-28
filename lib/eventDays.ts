import { format, parseISO } from "date-fns";
import type { Event, EventDay } from "@/types";

/**
 * Multi-day events (Phase 4).
 *
 * `Event.days` is optional and absent on every event created before it existed,
 * so no caller may read it directly — an unset `days` must read as the single
 * day `event.date`, not as "no days". Everything here funnels through
 * `eventDays()` so that fallback lives in exactly one place.
 */

type DayLike = Pick<Event, "date" | "time" | "endDate" | "days">;

/** The days an event runs, ascending. Never empty. */
export function eventDays(event: DayLike | null | undefined): EventDay[] {
  if (!event) return [];
  const explicit = event.days;
  if (explicit && explicit.length) {
    return [...explicit].sort((a, b) => a.date.localeCompare(b.date));
  }
  // Legacy / single-day: the event is its own one day.
  return [{ date: event.date, startTime: event.time }];
}

/** First and last day, "YYYY-MM-DD". */
export function eventDateRange(event: DayLike): { start: string; end: string } {
  const days = eventDays(event);
  return {
    start: days[0]?.date ?? event.date,
    end: event.endDate ?? days[days.length - 1]?.date ?? event.date,
  };
}

export function isMultiDay(event: DayLike): boolean {
  const { start, end } = eventDateRange(event);
  return start !== end;
}

/** Does this event run on `dateISO` ("YYYY-MM-DD")? */
export function isEventDay(event: DayLike, dateISO: string): boolean {
  return eventDays(event).some((d) => d.date === dateISO);
}

export function eventDay(event: DayLike, dateISO: string): EventDay | null {
  return eventDays(event).find((d) => d.date === dateISO) ?? null;
}

/** Which day of the run `dateISO` is: 1-based, 0 when the event doesn't run then. */
export function dayIndex(event: DayLike, dateISO: string): number {
  return eventDays(event).findIndex((d) => d.date === dateISO) + 1;
}

/**
 * Human date line for a run of days: "Tue 17 – Wed 18 Nov 2026",
 * "Wed, 18 Nov 2026", "Mon, 30 Nov – Tue, 01 Dec 2026". Collapses a shared
 * month and year rather than repeating them.
 *
 * Every event surface printed a single `date`, which is now wrong for E1 and E3
 * — a two-day conference read as one day. Callers use this instead.
 */
export function formatEventDayRange(
  event: DayLike,
  opts: { weekday?: boolean } = {}
): string {
  const weekday = opts.weekday ?? true;
  const dayFmt = weekday ? "EEE, dd MMM yyyy" : "dd MMM yyyy";
  try {
    const { start, end } = eventDateRange(event);
    const s = parseISO(start);
    if (start === end) return format(s, dayFmt);

    const e = parseISO(end);
    const sameMonthYear = format(s, "MMM yyyy") === format(e, "MMM yyyy");
    // No comma on either side of a range — "Tue 17 – Wed 18 Nov 2026" reads as
    // one span, where "Tue, 17 – Wed, 18 Nov 2026" reads as two dates.
    if (sameMonthYear) {
      return `${format(s, weekday ? "EEE dd" : "dd")} – ${format(e, weekday ? "EEE dd MMM yyyy" : "dd MMM yyyy")}`;
    }
    return `${format(s, weekday ? "EEE dd MMM" : "dd MMM")} – ${format(e, weekday ? "EEE dd MMM yyyy" : "dd MMM yyyy")}`;
  } catch {
    return event.date;
  }
}
