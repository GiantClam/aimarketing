export type LeadHunterEvidenceItem = {
  claim: string
  source_title: string
  source_url: string
  source_type: string
  source_provider: "tavily" | "serper" | "other"
  extracted_by: "tavily" | "not_extracted"
  confidence: "high" | "medium" | "low"
}
