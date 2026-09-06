/**
 * Provenance for the source snapshot used by the desktop message surface.
 * AI Elements is a shadcn registry: the source is copied into the app and
 * reviewed here, rather than loaded as a runtime package.
 */
export const AI_ELEMENTS_SOURCE_SNAPSHOT = {
  registryBaseUrl: "https://elements.ai-sdk.dev/api/registry",
  sourceRepository: "https://github.com/vercel/ai-elements",
  registryVersion: "2026-08-26",
  license: "Apache-2.0",
  components: ["attachments", "conversation", "message", "model-selector", "prompt-input", "sources", "artifact", "audio-player", "agent", "task", "tool", "image", "suggestion", "queue"],
  dependencies: {
    "@radix-ui/react-accordion": "1.2.2",
    ai: "^7.0.48",
    cmdk: "1.0.4",
    lucideReact: "^0.454.0",
    "media-chrome": "^4.19.2",
    streamdown: "pending-active-route-install",
    "use-stick-to-bottom": "1.1.3",
  },
} as const;
