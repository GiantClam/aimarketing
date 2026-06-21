export function shouldPreferInlineReferenceImages(input: {
  hasPptoken: boolean
  hasAiberm: boolean
  hasCrazyroute: boolean
}) {
  return input.hasPptoken || input.hasAiberm || input.hasCrazyroute
}
