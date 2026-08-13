export type WorkbenchSurface = "conversation" | "workflow" | "media" | "artifacts" | "usage";
export * from "./components";
export * from "./media";
export * from "./routes";
export * from "./route-icon";
export * from "./writer";

/** Visual contract shared by the online command-center and the desktop adapter. */
export const WORKBENCH_THEME = {
  light: {
    background: "#fdfdfb",
    foreground: "#111111",
    card: "#ffffff",
    primary: "#ffd000",
    primaryForeground: "#111111",
    muted: "#efefea",
    mutedForeground: "#777777",
    border: "#e5e5e0",
    sidebar: "#ffffff",
  },
  dark: {
    background: "#141414",
    foreground: "#f5f5f5",
    card: "#1a1a1a",
    primary: "#ffd21a",
    primaryForeground: "#1a1a1a",
    muted: "#262626",
    mutedForeground: "#b5b5b5",
    border: "rgba(245, 245, 245, 0.12)",
    sidebar: "#161616",
  },
  typography: {
    body: '"IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    display: '"Barlow Condensed", "Arial Narrow", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  },
  message: {
    maxWidth: "64rem",
    avatarSize: "2.25rem",
    avatarRadius: "6px",
    rowPadding: "0.875rem 1rem",
  },
} as const;

// Kept in lockstep with components/workspace/workspace-message-primitives.tsx
// so the Tauri surface uses the same message geometry as aimarketingsite.com.
export const WORKBENCH_MESSAGE_FRAME = {
  maxWidth: "64rem",
  rowPadding: "14px 16px",
  gap: "12px",
  avatarSize: "36px",
  avatarRadius: "6px",
  labelSize: "13px",
  bodySize: "14px",
  bodyLineHeight: "1.75",
  eventSize: "12px",
} as const;
