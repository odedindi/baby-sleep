import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dream Sounds — Baby Sleep",
    short_name: "Dream Sounds",
    description:
      "Soothing, generated sounds to help babies and children sleep. Works offline and keeps playing in the background.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    categories: ["health", "lifestyle", "kids"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
