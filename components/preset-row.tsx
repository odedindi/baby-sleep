"use client";

import { Baby, CloudRain, Fan, Music, Sparkles, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PRESETS, type PresetDef } from "@/lib/sounds";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Baby,
  CloudRain,
  Fan,
  Music,
  Waves,
};

interface PresetRowProps {
  /** ids of the preset whose exact mix is currently active, for highlight */
  activePresetId: string | null;
  onApply: (preset: PresetDef) => void;
}

export function PresetRow({ activePresetId, onApply }: PresetRowProps) {
  return (
    <section aria-label="Quick mixes" className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 px-1 font-heading text-sm font-semibold text-foreground/90">
        <Sparkles className="size-4 text-accent" />
        Quick mixes
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((preset) => {
          const Icon = ICONS[preset.icon] ?? Sparkles;
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApply(preset)}
              aria-pressed={isActive}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-foreground/90 hover:border-primary/40 hover:bg-card",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
