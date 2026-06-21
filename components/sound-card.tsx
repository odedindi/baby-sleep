"use client";

import {
  AudioLines,
  Baby,
  CloudRain,
  Droplets,
  Fan,
  Heart,
  Music,
  Waves,
  Wind,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { SoundDef, SoundId } from "@/lib/sounds";

const ICONS: Record<string, LucideIcon> = {
  AudioLines,
  Waves,
  Wind,
  CloudRain,
  Fan,
  Droplets,
  Heart,
  Baby,
  Music,
};

interface SoundCardProps {
  sound: SoundDef;
  active: boolean;
  volume: number;
  saved: boolean;
  onToggle: (id: SoundId) => void;
  onVolume: (id: SoundId, v: number) => void;
}

export function SoundCard({ sound, active, volume, saved, onToggle, onVolume }: SoundCardProps) {
  const Icon = ICONS[sound.icon] ?? AudioLines;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-300",
        active
          ? "border-primary/50 bg-card shadow-[0_0_28px_-6px_oklch(0.83_0.12_85/0.45)]"
          : "border-border bg-card/40 hover:border-primary/30 hover:bg-card/70",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(sound.id)}
        aria-pressed={active}
        aria-label={`${active ? "Stop" : "Play"} ${sound.name}`}
        className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-heading text-base font-semibold">{sound.name}</span>
            {saved && (
              <Check className="size-3.5 shrink-0 text-accent" aria-label="Saved offline" />
            )}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{sound.description}</span>
        </span>
      </button>

      {active && (
        <div className="flex items-center gap-3 pt-1">
          <Slider
            value={[Math.round(volume * 100)]}
            min={0}
            max={100}
            step={1}
            aria-label={`${sound.name} volume`}
            onValueChange={(v) => {
              const volume = typeof v === "number" ? v : (v[0] ?? 0);
              onVolume(sound.id, volume / 100);
            }}
            className="flex-1"
          />
          <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(volume * 100)}
          </span>
        </div>
      )}
    </div>
  );
}
