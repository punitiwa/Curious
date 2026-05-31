import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Curious — long reads",
    short_name: "Curious",
    description:
      "Premium long-form essays distilling the world's most influential non-fiction. 10–15 minute reads.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#faf8f3",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
