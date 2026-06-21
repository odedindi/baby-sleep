export type SoundId =
  | "white"
  | "pink"
  | "brown"
  | "rain"
  | "ocean"
  | "fan"
  | "wind"
  | "stream"
  | "heartbeat"
  | "womb"
  | "lullaby";

export interface SoundDef {
  id: SoundId;
  name: string;
  description: string;
  /** lucide icon name used in the UI */
  icon: string;
}

export const SOUNDS: SoundDef[] = [
  { id: "white", name: "White Noise", description: "Steady, even hush", icon: "AudioLines" },
  { id: "pink", name: "Pink Noise", description: "Softer, balanced hush", icon: "Waves" },
  { id: "brown", name: "Brown Noise", description: "Deep, low rumble", icon: "Wind" },
  { id: "rain", name: "Rain", description: "Gentle falling rain", icon: "CloudRain" },
  { id: "ocean", name: "Ocean Waves", description: "Slow rolling waves", icon: "Waves" },
  { id: "fan", name: "Fan", description: "Soft whirring fan", icon: "Fan" },
  { id: "wind", name: "Wind", description: "Drifting breeze", icon: "Wind" },
  { id: "stream", name: "Stream", description: "Trickling water", icon: "Droplets" },
  { id: "heartbeat", name: "Heartbeat", description: "Calm, steady pulse", icon: "Heart" },
  { id: "womb", name: "Womb", description: "Warm, muffled comfort", icon: "Baby" },
  { id: "lullaby", name: "Music Box", description: "Soft lullaby melody", icon: "Music" },
];

export interface PresetDef {
  id: string;
  name: string;
  icon: string;
  /** sound id -> volume (0..1) */
  mix: Partial<Record<SoundId, number>>;
}

export const PRESETS: PresetDef[] = [
  {
    id: "womb-cuddle",
    name: "Womb & Heartbeat",
    icon: "Baby",
    mix: { womb: 0.8, heartbeat: 0.55 },
  },
  {
    id: "rainy-night",
    name: "Rainy Night",
    icon: "CloudRain",
    mix: { rain: 0.7, brown: 0.45, wind: 0.3 },
  },
  { id: "ocean-calm", name: "Ocean Calm", icon: "Waves", mix: { ocean: 0.75, pink: 0.35 } },
  { id: "cozy-nap", name: "Cozy Nap", icon: "Fan", mix: { fan: 0.7, white: 0.3 } },
  { id: "dreamland", name: "Dreamland", icon: "Music", mix: { lullaby: 0.6, stream: 0.4 } },
];
