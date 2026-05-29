import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Event, RSVP } from "@/types";

// ─── Utility ────────────────────────────────────────────────────────────────
// Firestore throws if any field value is `undefined` (including nested objects).
// This strips them recursively so callers don't have to be defensive everywhere.

function stripUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)])
  ) as T;
}

// ─── EVENTS ─────────────────────────────────────────────────────────────────

export async function getEvents(): Promise<Event[]> {
  const snap = await getDocs(
    query(collection(db, "events"), orderBy("date", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Event));
}

export function subscribeToEvents(
  callback: (events: Event[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "events"), orderBy("date", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Event)))
  );
}

export async function getEvent(eventId: string): Promise<Event | null> {
  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Event;
}

export async function createEvent(
  data: Omit<Event, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "events"), {
    ...stripUndefined(data),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEvent(
  eventId: string,
  data: Partial<Event>
): Promise<void> {
  await updateDoc(doc(db, "events", eventId), {
    ...stripUndefined(data),
    updatedAt: serverTimestamp(),
  });
}

// ─── RSVPs ──────────────────────────────────────────────────────────────────

export async function getRSVPs(eventId: string): Promise<RSVP[]> {
  const snap = await getDocs(
    query(
      collection(db, "events", eventId, "rsvps"),
      orderBy("submittedAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RSVP));
}

export function subscribeToRSVPs(
  eventId: string,
  callback: (rsvps: RSVP[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "events", eventId, "rsvps"),
      orderBy("submittedAt", "desc")
    ),
    (snap) => {
      const rsvps = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RSVP));
      callback(rsvps);
    }
  );
}

export async function createRSVP(
  eventId: string,
  data: Omit<RSVP, "id" | "eventId" | "submittedAt" | "updatedAt">
): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "events", eventId, "rsvps"), {
    ...data,
    eventId,
    submittedAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateRSVP(
  eventId: string,
  rsvpId: string,
  data: Partial<RSVP>
): Promise<void> {
  await updateDoc(doc(db, "events", eventId, "rsvps", rsvpId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
