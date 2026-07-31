export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(task: () => Promise<T>) {
    const next = this.tail.then(task, task)
    this.tail = next.then(() => undefined, () => undefined)
    return next
  }
}
