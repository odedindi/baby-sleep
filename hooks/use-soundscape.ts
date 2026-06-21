"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SoundId, PresetDef } from "@/lib/sounds";
import { SOUNDS } from "@/lib/sounds";
import { SoundscapeEngine } from "@/lib/audio-engine";
import { getSavedIds, saveSoundOffline } from "@/lib/offline-store";

export interface SoundscapeState {
  active: Record<string, number>; // id -> volume (0..1)
  isPlaying: boolean;
  masterVolume: number;
  isMuted: boolean;
  savedIds: SoundId[];
  isSaving: boolean;
  /** seconds remaining on the sleep timer, or null when no timer is set */
  timerRemaining: number | null;
}

const FADE_SECONDS = 20;
const LS_MIX = "dreamsounds:mix";
const LS_VOL = "dreamsounds:volume";
const LS_TIMER_END = "dreamsounds:timerEnd";

interface PersistedMix {
  active: Record<string, number>;
}

function loadPersistedMix(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_MIX);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedMix;
    const valid: Record<string, number> = {};
    for (const [id, v] of Object.entries(parsed.active ?? {})) {
      if (SOUNDS.some((s) => s.id === id) && typeof v === "number") {
        valid[id] = Math.min(1, Math.max(0, v));
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function loadPersistedVolume(): number {
  if (typeof window === "undefined") return 0.8;
  const raw = localStorage.getItem(LS_VOL);
  const n = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.8;
}

export function useSoundscape() {
  // One persistent engine instance for the lifetime of the component.
  const engineRef = useRef<SoundscapeEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SoundscapeEngine();

  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against a stale fade-out firing after the timer was cleared/restarted.
  const fadeTokenRef = useRef(0);

  const [active, setActive] = useState<Record<string, number>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [savedIds, setSavedIds] = useState<SoundId[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore persisted prefs + saved-offline list on mount. The AudioContext
  // itself is NOT created here — browsers require a user gesture, so the
  // engine lazily creates it on the first play()/toggleSound() call.
  useEffect(() => {
    let isMounted = true;
    getSavedIds()
      .then((ids) => {
        if (isMounted) setSavedIds(ids);
      })
      .catch((err) => {
        if (isMounted) console.error("Failed to load saved sounds:", err);
      });

    const savedVol = loadPersistedVolume();
    setMasterVolumeState(savedVol);
    setActive(loadPersistedMix());
    setHydrated(true);

    const engine = engineRef.current;
    return () => {
      isMounted = false;
      engine?.destroy();
    };
  }, []);

  // Persist preferences whenever they change (after initial hydration).
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS_MIX, JSON.stringify({ active }));
  }, [active, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS_VOL, String(masterVolume));
  }, [masterVolume, hydrated]);

  const setMasterVolume = useCallback((v: number) => {
    setMasterVolumeState(v);
    if (v > 0) setIsMuted(false);
    engineRef.current?.setMasterVolume(v);
  }, []);

  useEffect(() => {
    engineRef.current?.setMasterVolume(isMuted ? 0 : masterVolume);
  }, [masterVolume, isMuted]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  /* ------------------------------ media session --------------------------- */

  const updateMediaSession = useCallback(
    (currentActive: Record<string, number>, playing: boolean) => {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      const ids = Object.keys(currentActive) as SoundId[];
      const names = ids.map((id) => SOUNDS.find((s) => s.id === id)?.name).filter(Boolean);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: names.length ? names.join(" + ") : "Dream Sounds",
        artist: "Dream Sounds",
        album: "Sleep Soundscapes",
        artwork: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    },
    [],
  );

  useEffect(() => {
    updateMediaSession(active, isPlaying);
  }, [active, isPlaying, updateMediaSession]);

  /* --------------------------- playback controls --------------------------- */

  const play = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || Object.keys(active).length === 0) return;
    engine.resume();
    setIsPlaying(true);
  }, [active]);

  const pause = useCallback(() => {
    engineRef.current?.suspend();
    setIsPlaying(false);
  }, []);

  const clearTimer = useCallback(() => {
    fadeTokenRef.current += 1; // invalidate any in-flight fade callback
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
    setTimerRemaining(null);
    if (typeof window !== "undefined") localStorage.removeItem(LS_TIMER_END);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stopAll();
    setIsPlaying(false);
    setActive({});
    clearTimer();
  }, [clearTimer]);

  const toggleSound = useCallback((id: SoundId) => {
    const engine = engineRef.current;
    setActive((prev) => {
      const next = { ...prev };
      if (id in next) {
        delete next[id];
        engine?.stop(id);
      } else {
        next[id] = 0.7;
        void engine?.setVolume(id, 0.7);
        setIsPlaying(true);
      }
      return next;
    });
  }, []);

  const setSoundVolume = useCallback((id: SoundId, volume: number) => {
    setActive((prev) => {
      if (!(id in prev)) return prev;
      void engineRef.current?.setVolume(id, volume);
      return { ...prev, [id]: volume };
    });
  }, []);

  const applyPreset = useCallback((preset: PresetDef) => {
    const engine = engineRef.current;
    setActive((prev) => {
      // Crossfade out anything currently playing that isn't in the new preset,
      // and crossfade in/level-set everything that is.
      for (const id of Object.keys(prev) as SoundId[]) {
        if (!(id in preset.mix)) engine?.stop(id);
      }
      for (const [id, volume] of Object.entries(preset.mix) as [SoundId, number][]) {
        void engine?.setVolume(id, volume);
      }
      return { ...preset.mix } as Record<string, number>;
    });
    setIsPlaying(true);
  }, []);

  /* ----------------------------- sleep timer ----------------------------- */

  const fadeOutAndStop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const myToken = ++fadeTokenRef.current;
    engine.fadeOutMaster(FADE_SECONDS, () => {
      if (fadeTokenRef.current !== myToken) return; // a newer timer/clear superseded this fade
      pause();
      engine.resetMasterVolume(isMuted ? 0 : masterVolume); // restore for next time
    });
  }, [masterVolume, isMuted, pause]);

  const fadeStartedRef = useRef(false);

  const runCountdown = useCallback(
    (endAt: number) => {
      if (tickTimer.current) clearInterval(tickTimer.current);
      fadeStartedRef.current = false;
      const tick = () => {
        const remaining = Math.round((endAt - Date.now()) / 1000);
        setTimerRemaining(Math.max(0, remaining));
        if (remaining <= FADE_SECONDS && !fadeStartedRef.current && remaining > 0) {
          fadeStartedRef.current = true;
          fadeOutAndStop();
        }
        if (remaining <= 0) clearTimer();
      };
      tick();
      tickTimer.current = setInterval(tick, 1000);
    },
    [clearTimer, fadeOutAndStop],
  );

  const startTimer = useCallback(
    (minutes: number) => {
      clearTimer();
      const endAt = Date.now() + Math.round(minutes * 60) * 1000;
      if (typeof window !== "undefined") localStorage.setItem(LS_TIMER_END, String(endAt));
      runCountdown(endAt);
    },
    [clearTimer, runCountdown],
  );

  // Resume a sleep timer that was running before a reload.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const raw = localStorage.getItem(LS_TIMER_END);
    if (!raw) return;
    const endAt = Number.parseInt(raw, 10);
    if (Number.isFinite(endAt) && endAt - Date.now() > 1000) {
      runCountdown(endAt);
    } else {
      localStorage.removeItem(LS_TIMER_END);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Wire up lock-screen / hardware media controls.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => void play());
    ms.setActionHandler("pause", () => pause());
    ms.setActionHandler("stop", () => stop());
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("stop", null);
    };
  }, [play, pause, stop]);

  /* ------------------------------ offline -------------------------------- */

  const saveAllOffline = useCallback(async () => {
    setIsSaving(true);
    try {
      for (const s of SOUNDS) {
        await saveSoundOffline(s.id);
      }
      setSavedIds(await getSavedIds());
    } finally {
      setIsSaving(false);
    }
  }, []);

  const state: SoundscapeState = useMemo(
    () => ({
      active,
      isPlaying,
      masterVolume,
      isMuted,
      savedIds,
      isSaving,
      timerRemaining,
    }),
    [active, isPlaying, masterVolume, isMuted, savedIds, isSaving, timerRemaining],
  );

  return {
    ...state,
    play,
    pause,
    stop,
    toggleSound,
    setSoundVolume,
    setMasterVolume,
    toggleMute,
    applyPreset,
    startTimer,
    clearTimer,
    saveAllOffline,
  };
}
