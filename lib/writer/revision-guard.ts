import {
  isIncompleteWriterRevisionContent,
  isWriterTitleOnlyRevisionRequest,
  reconcileWriterRevisionResult as reconcileSharedWriterRevisionResult,
} from "@aimarketing/writer-core"

import type { WriterActiveDraft } from "./runtime/session-runtime"
import type { WriterSubmitResult } from "./writer-result"

export { isIncompleteWriterRevisionContent, isWriterTitleOnlyRevisionRequest }

/** SaaS type adapter over the host-neutral Writer revision guard. */
export function reconcileWriterRevisionResult(input: {
  query: string
  result: WriterSubmitResult
  activeDraft: WriterActiveDraft | null | undefined
}) {
  return reconcileSharedWriterRevisionResult(input)
}
