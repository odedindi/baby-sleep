"use client";

import { Download, Loader2, Pause, Play, Square, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { PRESETS, SOUNDS } from "@/lib/sounds";
import { useSoundscape } from "@/hooks/use-soundscape";
import { SoundCard } from "@/components/sound-card";
import { SleepTimer } from "@/components/sleep-timer";
import { PresetRow } from "@/components/preset-row";
import { StarField } from "@/components/star-field";
import { cn } from "@/lib/utils";

/** Find a preset whose exact sound set matches the active mix (volumes aside). */
function matchPreset(active: Record<string, number>): string | null {
  const activeIds = Object.keys(active).sort().join(",");
  if (!activeIds) return null;
  for (const p of PRESETS) {
    const presetIds = Object.keys(p.mix).sort().join(",");
    if (presetIds === activeIds) return p.id;
  }
  return null;
}

export function DreamSounds() {
  const s = useSoundscape();
  const activeCount = Object.keys(s.active).length;
  const allSaved = s.savedIds.length >= SOUNDS.length;
  const activePresetId = matchPreset(s.active);

  return (
    <main className="relative min-h-dvh">
      <StarField />

      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-44 pt-10 sm:px-6">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-balance font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Dream Sounds
          </h1>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground sm:text-base">
            Soothing sounds to help your little one drift off. Mix sounds, set a timer, and play
            even with the screen off.
          </p>
        </header>

        {/* Offline + status */}
        <div className="mb-6 flex items-center justify-center">
          <button
            type="button"
            onClick={s.saveAllOffline}
            disabled={s.isSaving || allSaved}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              allSaved
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-card/60 text-foreground/90 hover:border-primary/40",
            )}
          >
            {s.isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : allSaved ? (
              <WifiOff className="size-4" />
            ) : (
              <Download className="size-4" />
            )}
            {s.isSaving
              ? "Saving sounds…"
              : allSaved
                ? "Available offline"
                : "Save all for offline"}
          </button>
        </div>

        {/* Quick mixes */}
        <PresetRow activePresetId={activePresetId} onApply={s.applyPreset} />

        {/* Sound grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOUNDS.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              active={sound.id in s.active}
              volume={s.active[sound.id] ?? 0.7}
              saved={s.savedIds.includes(sound.id)}
              onToggle={s.toggleSound}
              onVolume={s.setSoundVolume}
            />
          ))}
        </div>

        {/* Sleep timer */}
        <div className="mt-6">
          <SleepTimer remaining={s.timerRemaining} onStart={s.startTimer} onClear={s.clearTimer} />
        </div>
      </div>

      {/* Fixed transport bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={s.isPlaying ? s.pause : s.play}
            disabled={activeCount === 0}
            aria-label={s.isPlaying ? "Pause" : "Play"}
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-full transition-all",
              activeCount === 0
                ? "bg-secondary text-muted-foreground"
                : "bg-primary text-primary-foreground shadow-[0_0_24px_-4px_oklch(0.83_0.12_85/0.6)] hover:scale-105",
            )}
          >
            {s.isPlaying ? (
              <Pause className="size-6" />
            ) : (
              <Play className="ml-0.5 size-6" />
            )}
          </button>

          <button
            type="button"
            onClick={s.stop}
            disabled={activeCount === 0}
            aria-label="Stop and clear all sounds"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/80 transition-colors hover:bg-secondary/70 disabled:opacity-40"
          >
            <Square className="size-4" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm font-medium" aria-live="polite">
              {activeCount === 0
                ? "Choose a sound to begin"
                : `${activeCount} sound${activeCount > 1 ? "s" : ""} mixing`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={s.toggleMute}
                disabled={activeCount === 0}
                aria-label={s.isMuted ? "Unmute" : "Mute"}
                aria-pressed={s.isMuted}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                {s.isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <Slider
                value={[Math.round((s.isMuted ? 0 : s.masterVolume) * 100)]}
                min={0}
                max={100}
                step={1}
                aria-label="Master volume"
                onValueChange={(v) => {
                  const volume = typeof v === "number" ? v : (v[0] ?? 0);
                  s.setMasterVolume(volume / 100);
                }}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
