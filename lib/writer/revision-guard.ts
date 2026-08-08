import type { WriterActiveDraft } from "./runtime/session-runtime"
import type { WriterSubmitResult } from "./writer-result"

const TITLE_SIGNAL = /(?:标题|标题名|headline|title)/iu
const TITLE_ONLY_SIGNAL = /(?:仅|只|只需|只要|only|just)/iu
const PRESERVE_SIGNAL = /(?:正文|内容|图片|配图|body|content|image|images).*(?:保持|保留|不变|原样|unchanged|same|preserve|keep)/iu
const BODY_MUTATION_SIGNAL = /(?:正文|内容|body|content|article).*(?:改|翻译|重写|改写|rewrite|translate|revise|change)/iu
const INCOMPLETE_REVISION_SIGNAL = /(?:正文后续保持不变|其余正文.*(?:保持不变|不变)|正文省略|rest of (?:the )?(?:article|body|content).*(?:unchanged|same|preserved|retain)|(?:the )?(?:remaining|rest).*(?:article|body|content).*(?:unchanged|same)|application.*(?:preserve|retain).*(?:article|body|content)|\.\.\.\s*(?:正文|文章|article|body|content)?)/iu

export function isWriterTitleOnlyRevisionRequest(query: string) {
  const normalized = query.trim()
  if (!TITLE_SIGNAL.test(normalized)) return false
  if (BODY_MUTATION_SIGNAL.test(normalized)) return false
  return TITLE_ONLY_SIGNAL.test(normalized) || PRESERVE_SIGNAL.test(normalized)
}

export function isIncompleteWriterRevisionContent(content: string) {
  return INCOMPLETE_REVISION_SIGNAL.test(content)
}

function replaceMarkdownTitle(content: string, title: string) {
  const normalizedTitle = title.trim()
  const heading = /^#\s+.*$/mu
  if (heading.test(content)) return content.replace(heading, `# ${normalizedTitle}`)
  return `# ${normalizedTitle}\n\n${content.trim()}`
}

export function reconcileWriterRevisionResult(input: {
  query: string
  result: WriterSubmitResult
  activeDraft: WriterActiveDraft | null | undefined
}) {
  const { activeDraft, result } = input
  if (!activeDraft?.content || !result.draft) return result

  if (isWriterTitleOnlyRevisionRequest(input.query)) {
    const title = result.draft.title.trim()
    if (!title) return result
    if (title === activeDraft.title.trim()) {
      throw new Error("writer_result_title_change_missing")
    }
    return {
      ...result,
      outcome: "draft_ready" as const,
      draft: {
        ...result.draft,
        title,
        content: replaceMarkdownTitle(activeDraft.content, title),
        baseRevision: activeDraft.revision,
      },
    }
  }

  if (isIncompleteWriterRevisionContent(result.draft.content)) {
    throw new Error("writer_result_incomplete_revision")
  }

  return result
}
