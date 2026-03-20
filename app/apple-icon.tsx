import { ImageResponse } from "next/og"

export const size = {
  width: 180,
  height: 180,
}

export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 122,
            height: 122,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 32,
            background: "#F6D94C",
            color: "#111111",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          ai
        </div>
      </div>
    ),
    size,
  )
}
