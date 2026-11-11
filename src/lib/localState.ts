// Per-account UI state: which memos are pinned on the calendar and where, and
// whether the tutorial was seen.
//
// The account copy (Supabase user metadata, keys below) is what follows the user
// to other devices. The copy in this browser's localStorage is used when the
// account has nothing saved yet, and keeps things working if a save fails.

export type PinLayout = { id: string; x: number; y: number; w: number; h: number };

/** Keys inside the Supabase user's metadata */
export const ACCOUNT_PINS_KEY = 'planner_pins';
export const ACCOUNT_TUTORIAL_KEY = 'planner_tutorial_seen';
/** Upper bound on what is stored with the account (it travels inside the login token) */
export const MAX_ACCOUNT_PINS = 30;

/** Reads our keys out of a Supabase user's metadata. `pins: null` = never saved to the account. */
export function readAccountState(metadata: unknown): { pins: PinLayout[] | null; tutorialSeen: boolean } {
  const meta = (typeof metadata === 'object' && metadata !== null ? metadata : {}) as Record<string, unknown>;
  const rawPins = meta[ACCOUNT_PINS_KEY];
  return {
    pins: Array.isArray(rawPins) ? rawPins.filter(isPin) : null,
    tutorialSeen: meta[ACCOUNT_TUTORIAL_KEY] === true,
  };
}

export function samePins(a: PinLayout[], b: PinLayout[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const pinsKey = (userId: string) => `planner:pins:${userId}`;
const tutorialKey = (userId: string) => `planner:tutorialSeen:${userId}`;

const isPin = (p: unknown): p is PinLayout => {
  if (typeof p !== 'object' || p === null) return false;
  const pin = p as Record<string, unknown>;
  return (
    typeof pin.id === 'string' &&
    [pin.x, pin.y, pin.w, pin.h].every((n) => typeof n === 'number' && Number.isFinite(n))
  );
};

export function loadPins(userId: string): PinLayout[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(pinsKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isPin) : [];
  } catch {
    return [];
  }
}

export function savePins(userId: string, pins: PinLayout[]) {
  try {
    localStorage.setItem(pinsKey(userId), JSON.stringify(pins));
  } catch {
    // Storage full or blocked: pins just won't survive a reload
  }
}

const pendingKey = (userId: string) => `planner:pinsPending:${userId}`;

/**
 * Marks that this browser has pin changes the account doesn't have yet
 * (the page was closed before they were sent, or sending failed).
 * On the next visit those local pins win over the account's copy.
 */
export function setPinsPending(userId: string, pending: boolean) {
  try {
    if (pending) localStorage.setItem(pendingKey(userId), 'true');
    else localStorage.removeItem(pendingKey(userId));
  } catch {
    // ignore
  }
}

export function pinsPending(userId: string): boolean {
  try {
    return localStorage.getItem(pendingKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function tutorialSeen(userId: string): boolean {
  try {
    return localStorage.getItem(tutorialKey(userId)) === 'true';
  } catch {
    return true;
  }
}

export function markTutorialSeen(userId: string) {
  try {
    localStorage.setItem(tutorialKey(userId), 'true');
  } catch {
    // ignore
  }
}
