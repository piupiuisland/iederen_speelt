import { useEffect, useState } from "react";

/** Re-render every `ms` while `active`. Display only: the clock is derived from timestamps, not ticks. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return active ? now : Date.now();
}

export type WakeLockStatus = "on" | "off" | "unsupported";

/**
 * Keep the screen on while `active` (Screen Wake Lock API: iOS 16.4+, Android Chrome).
 * Browsers drop the lock when the page is hidden, so it is re-acquired on return.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? "off" : "unsupported");

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) return void s.release();
        sentinel = s;
        setStatus("on");
        s.addEventListener("release", () => setStatus("off"));
      } catch {
        setStatus("off");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active, supported]);

  return active ? status : supported ? "off" : "unsupported";
}

let audio: AudioContext | null = null;

/** Must be called from a tap: browsers only allow sound after a user gesture. */
export function primeAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

/** Short double beep (best effort; silent if the phone is muted or audio isn't primed). */
export function beep(): void {
  if (!audio) return;
  try {
    for (const offset of [0, 0.25]) {
      const t = audio.currentTime + offset;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    // ignore
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported (e.g. iPhone)
  }
}
