"use client";

import { Moon, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [15, 30, 45, 60, 90];

function formatTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SleepTimerProps {
  remaining: number | null;
  onStart: (minutes: number) => void;
  onClear: () => void;
}

export function SleepTimer({ remaining, onStart, onClear }: SleepTimerProps) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-heading text-sm font-semibold">
          <Timer className="size-4 text-accent" />
          Sleep timer
        </span>
        {remaining !== null && (
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm tabular-nums text-primary">
              {formatTime(remaining)}
            </span>
            <button
              type="button"
              onClick={onClear}
              aria-label="Cancel sleep timer"
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((min) => (
          <button
            key={min}
            type="button"
            onClick={() => onStart(min)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              "border-border bg-secondary/60 text-foreground/90 hover:border-primary/40 hover:bg-secondary",
            )}
          >
            {min}m
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Moon className="size-3.5" />
        Audio gently fades out before the timer ends.
      </p>
    </div>
  );
}
