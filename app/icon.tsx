import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1a1814",
          color: "#faf8f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "serif",
          fontSize: 360,
          fontWeight: 600,
          letterSpacing: "-0.04em",
          borderRadius: 96,
        }}
      >
        C
      </div>
    ),
    size
  );
}
