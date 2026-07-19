import type { Event } from "@/types";

// Default option lists for the public RSVP form's category + industry dropdowns.
// Used when an event doesn't define its own — so existing events (and any new
// one that skips the config) keep working with sensible defaults.

export const DEFAULT_GUEST_CATEGORIES = [
  "Guest",
  "Business Partner (Corporate Client)",
  "Impact Partner (Sponsor / Enabler)",
  "Skill Partner (Technology Partner)",
  "Other",
];

export const DEFAULT_INDUSTRIES = [
  "Technology & Digital",
  "Healthcare & Pharma",
  "Education & Training",
  "Retail & Consumer",
  "Banking & Finance",
  "Professional Services",
  "Property & Construction",
  "Government & GLC",
  "Others",
];

/** Resolve the "I am part of this event as a" options for an event. */
export function guestCategoriesFor(event: Pick<Event, "guestCategories">): string[] {
  return event.guestCategories && event.guestCategories.length > 0
    ? event.guestCategories
    : DEFAULT_GUEST_CATEGORIES;
}

/** Resolve the industry dropdown options for an event. */
export function industriesFor(event: Pick<Event, "industries">): string[] {
  return event.industries && event.industries.length > 0
    ? event.industries
    : DEFAULT_INDUSTRIES;
}
