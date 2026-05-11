import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME, PAPER_BACKGROUND } from "@/lib/kinship/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Kinship",
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: PAPER_BACKGROUND,
    theme_color: PAPER_BACKGROUND,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
