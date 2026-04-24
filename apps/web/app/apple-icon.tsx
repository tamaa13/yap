import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FFB800",
          borderRadius: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4.5L8 18v-2.5H8a2 2 0 0 1-2-2v-5Z"
            fill="#0A0B0F"
          />
          <circle cx="12" cy="11" r="1.5" fill="#FFB800" />
        </svg>
      </div>
    ),
    size,
  );
}
