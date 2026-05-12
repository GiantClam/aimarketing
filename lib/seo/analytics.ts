export const SEO_EVENT = {
  homepageCtaClick: "seo_homepage_cta_click",
  seoPageCtaClick: "seo_page_cta_click",
  calculatorStarted: "seo_calculator_started",
  calculatorEstimateReady: "seo_calculator_estimate_ready",
  calculatorCtaClick: "seo_calculator_cta_click",
  pricingCtaClick: "seo_pricing_cta_click",
} as const

export type SeoEventName = (typeof SEO_EVENT)[keyof typeof SEO_EVENT]
