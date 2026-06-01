export function getLeadToolEndpoint(slug: string, action: "preview" | "download" | "finalize") {
  return `/api/tools/${slug}/${action}`
}
