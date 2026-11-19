import { useSyncExternalStore } from "react";

// Bridges the service-worker registration (main.tsx) to React without the
// components importing the PWA virtual module, so they stay testable.

let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();

export function setUpdateAvailable(apply: () => void): void {
  applyUpdate = apply;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A function that installs the new version and reloads, or null if none is waiting. */
export function useAvailableUpdate(): (() => void) | null {
  return useSyncExternalStore(subscribe, () => applyUpdate);
}
