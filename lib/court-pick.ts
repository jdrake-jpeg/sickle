// A tiny hand off between a screen that needs a court and the map screen that
// lets you pick one. The screen says what to do, the map calls it back.
let handler: ((courtId: string) => void) | null = null;

export function waitForCourtPick(fn: (courtId: string) => void) {
  handler = fn;
}

export function deliverCourtPick(courtId: string) {
  const fn = handler;
  handler = null;
  fn?.(courtId);
}
