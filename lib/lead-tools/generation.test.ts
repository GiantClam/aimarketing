import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let providerAvailable = false
let structuredResponse: unknown = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/writer/aiberm") {
    return {
      hasAibermApiKey: () => providerAvailable,
      hasCrazyrouteApiKey: () => false,
      generateStructuredObjectWithWriterModel: async () => structuredResponse,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let generation: typeof import("./generation")

test.before(async () => {
  generation = await import("./generation")
})

test.beforeEach(() => {
  providerAvailable = false
  structuredResponse = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("falls back to mock PPT preview when no provider is available", async () => {
  const deck = await generation.generateLeadToolPptPreviewWithFallback(
    {
      prompt: "AI Marketing launch plan",
      scenario: "product-launch",
      language: "en-US",
    },
    true,
  )

  assert.equal(deck.title, "AI Marketing launch plan")
  assert.equal(deck.variants.length, 4)
  assert.equal(deck.variants[0]?.slides.length, 5)
})

test("uses real structured PPT plan when provider is available", async () => {
  providerAvailable = true
  structuredResponse = {
    title: "Revenue expansion deck",
    outline: ["Problem", "Offer", "Proof", "Plan", "Next Step"],
    slides: [
      { layout: "cover", kicker: "SALES", title: "Revenue expansion deck", body: "A sharper proposal for enterprise growth.", bullets: ["B2B focus", "Executive-ready"] },
      { layout: "agenda", kicker: "OVERVIEW", title: "Story flow", body: "Move from pain to plan.", bullets: ["Problem", "Offer", "Proof", "Plan", "Next Step"] },
      { layout: "insight", kicker: "INSIGHT", title: "Why now", body: "Teams need clearer ROI and faster execution.", bullets: ["Budget pressure", "Tool sprawl", "Proof gap"] },
      { layout: "comparison", kicker: "OPTIONS", title: "Why this plan wins", body: "Better speed, clarity, and rollout support.", bullets: ["Faster launch", "Lower friction", "Higher trust"] },
      { layout: "timeline", kicker: "ACTION", title: "Suggested rollout", body: "Start with one buyer segment and expand.", bullets: ["Pilot", "Measure", "Scale"] },
    ],
  }

  const deck = await generation.generateLeadToolPptPreviewWithFallback(
    {
      prompt: "Ignored by structured response",
      scenario: "sales-deck",
      language: "en-US",
    },
    false,
  )

  assert.equal(deck.title, "Revenue expansion deck")
  assert.equal(deck.outline[0], "Problem")
  assert.equal(deck.variants[0]?.slides[0]?.title, "Revenue expansion deck")
  assert.equal(deck.variants[0]?.slides[0]?.accent, deck.variants[0]?.palette.accent)
})

test("falls back to mock SEO preview when no provider is available", async () => {
  const preview = await generation.generateLeadToolSeoPreviewWithFallback(
    {
      topic: "AI PPT generator",
      audience: "marketing teams",
      pageType: "landing-page",
      language: "en-US",
    },
    true,
  )

  assert.equal(preview.variants.length, 3)
  assert.match(preview.summary, /Generated 3 SEO meta directions/i)
})

test("uses real structured SEO preview when provider is available", async () => {
  providerAvailable = true
  structuredResponse = {
    summary: "Three search-ready directions for AI PPT generator.",
    variants: [
      {
        key: "conversion-first",
        name: "Conversion First",
        angle: "High-intent acquisition copy.",
        title: "AI PPT generator for faster campaign decks | AI Marketing",
        description: "Create pitch decks and campaign slides faster with AI-first workflows.",
        keywords: ["ai ppt generator", "campaign deck tool", "slide generator"],
        slug: "ai-ppt-generator",
        h1: "AI PPT Generator",
        cta: "Generate your deck",
      },
      {
        key: "seo-coverage",
        name: "Long-tail Coverage",
        angle: "Search-friendly landing coverage.",
        title: "AI PPT generator templates and meta ideas",
        description: "Build search-ready titles, descriptions, and H1s for AI PPT generator pages.",
        keywords: ["ai ppt generator template", "ai ppt title", "ai ppt meta description"],
        slug: "ai-ppt-generator-template",
        h1: "AI PPT Generator SEO Ideas",
        cta: "Explore more variants",
      },
      {
        key: "authority-signal",
        name: "Authority Signal",
        angle: "Expert-led positioning.",
        title: "AI PPT generator best practices for marketing teams",
        description: "Show clearer value, trust, and workflow fit for AI PPT generator pages.",
        keywords: ["ai ppt generator best practices", "ai ppt generator guide", "ai ppt generator examples"],
        slug: "ai-ppt-generator-best-practices",
        h1: "AI PPT Generator Best Practices",
        cta: "Generate an expert version",
      },
    ],
  }

  const preview = await generation.generateLeadToolSeoPreviewWithFallback(
    {
      topic: "AI PPT generator",
      audience: "marketing teams",
      pageType: "landing-page",
      language: "en-US",
    },
    false,
  )

  assert.equal(preview.summary, "Three search-ready directions for AI PPT generator.")
  assert.equal(preview.variants[1]?.slug, "ai-ppt-generator-template")
})
