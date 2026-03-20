import { ImageResponse } from "next/og"

export const size = {
  width: 64,
  height: 64,
}

export const contentType = "image/png"

export default function Icon() {
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
          borderRadius: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            background: "#F6D94C",
            color: "#111111",
            fontSize: 24,
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
