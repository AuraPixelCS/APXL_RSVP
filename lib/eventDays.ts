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

/**
 * Days a pass admits to. Single-day Summit tickets (F12/F13/F14) store their
 * day on the RSVP as `days`; everything else reads as every day of the event.
 * Anything on the RSVP that isn't an event day is ignored — a partner sending
 * "19 Nov" against a 12–14 Nov event must not silently create a dead pass.
 */
export function passDays(event: DayLike, days: string[] | null | undefined): EventDay[] {
  const all = eventDays(event);
  if (!Array.isArray(days) || !days.length) return all;
  const wanted = new Set(days.map((d) => String(d).trim().slice(0, 10)));
  const subset = all.filter((d) => wanted.has(d.date));
  return subset.length ? subset : all;
}

/** True when the pass covers fewer days than the event runs. */
export function isDayRestricted(event: DayLike, days: string[] | null | undefined): boolean {
  return passDays(event, days).length < eventDays(event).length;
}

/**
 * Date line for a pass: the event's range when it covers every day, otherwise
 * the specific day(s) — "Thu, 12 Nov 2026" or "Thu, 12 Nov · Fri, 13 Nov 2026".
 */
export function formatPassDays(event: DayLike, days: string[] | null | undefined): string {
  if (!isDayRestricted(event, days)) return formatEventDayRange(event);
  const subset = passDays(event, days);
  try {
    if (subset.length === 1) return format(parseISO(subset[0].date), "EEE, dd MMM yyyy");
    return subset
      .map((d, i) => format(parseISO(d.date), i === subset.length - 1 ? "EEE, dd MMM yyyy" : "EEE, dd MMM"))
      .join(" · ");
  } catch {
    return subset.map((d) => d.date).join(", ");
  }
}
