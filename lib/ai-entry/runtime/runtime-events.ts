export type RuntimeTaskEvent = { event?: unknown }

/** Model text is assembled into the assistant message, not shown as a task step. */
export function isTaskProgressEvent<T extends RuntimeTaskEvent>(event: T): boolean {
  return event.event !== "text_delta"
}

export function filterTaskProgressEvents<T extends RuntimeTaskEvent>(events: T[]): T[] {
  return events.filter(isTaskProgressEvent)
}
