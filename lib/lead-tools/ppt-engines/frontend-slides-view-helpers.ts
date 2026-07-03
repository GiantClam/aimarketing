import type {
  PptPreviewDeck,
  PptPreviewSlide,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

export function escapeFrontendSlidesHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function buildFrontendSlidesHeadlineDeckLabel(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  return `${deck.scenario.replace(/-/g, " ")} / ${variant.name}`
}

export function buildFrontendSlidesDeckIssueNumber(variant: PptPreviewVariant) {
  return String(variant.slides.length).padStart(2, "0")
}

export function buildFrontendSlidesDeckDateStamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "00.00.00"
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
  const day = String(parsed.getUTCDate()).padStart(2, "0")
  const year = String(parsed.getUTCFullYear()).slice(-2)
  return `${month}.${day}.${year}`
}

export function renderFrontendSlidesFooter(label: string, progressPercent: number) {
  return `
    <div class="footer-bar">
      <span>${escapeFrontendSlidesHtml(label)}</span>
      <div class="progress"><span style="width:${progressPercent}%"></span></div>
    </div>
  `
}

export function renderFrontendSlidesWorkflowImageFigure(
  slide: PptPreviewSlide | undefined,
  placement: "cover" | "inline" = "inline",
) {
  const imageUrl = slide?.image?.url?.trim()
  if (!imageUrl) return ""
  const resolvedSlide = slide!

  const title = resolvedSlide.image?.title?.trim() || resolvedSlide.title?.trim() || "Workflow image"
  const sourceNodeKey = resolvedSlide.image?.sourceNodeKey?.trim() || ""
  const caption = resolvedSlide.image?.title?.trim() || ""

  return `
    <figure class="workflow-image-figure workflow-image-${placement}">
      <div class="workflow-image-frame">
        <img src="${escapeFrontendSlidesHtml(imageUrl)}" alt="${escapeFrontendSlidesHtml(title)}" loading="lazy" />
      </div>
      ${
        caption || sourceNodeKey
          ? `
            <figcaption class="workflow-image-caption">
              ${caption ? `<span>${escapeFrontendSlidesHtml(caption)}</span>` : '<span></span>'}
              ${sourceNodeKey ? `<span class="workflow-image-source">${escapeFrontendSlidesHtml(sourceNodeKey)}</span>` : ""}
            </figcaption>
          `
          : ""
      }
    </figure>
  `
}

export function renderFrontendSlidesBulletList(bullets: string[]) {
  return `
    <ul class="bullet-list">
      ${bullets
        .slice(0, 4)
        .map((bullet) => `<li><span class="bullet-dot"></span><p>${escapeFrontendSlidesHtml(bullet)}</p></li>`)
        .join("")}
    </ul>
  `
}

export function renderFrontendSlidesContentsCards(
  items: Array<{ index: string; title: string; detail: string }>,
  className: string,
) {
  return items
    .slice(0, 9)
    .map(
      (item) => `
        <article class="${className}">
          <span class="card-index">${escapeFrontendSlidesHtml(item.index)}</span>
          <h3>${escapeFrontendSlidesHtml(item.title)}</h3>
          <p>${escapeFrontendSlidesHtml(item.detail)}</p>
        </article>`,
    )
    .join("")
}
