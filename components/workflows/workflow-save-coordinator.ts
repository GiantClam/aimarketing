export type WorkflowSaveCoordinator<T> = {
  run: (snapshot: string, save: () => Promise<T>) => Promise<T>
}

export function createWorkflowSaveCoordinator<T>(): WorkflowSaveCoordinator<T> {
  let inFlightSnapshot: string | null = null
  let inFlightPromise: Promise<T> | null = null

  const run = (snapshot: string, save: () => Promise<T>): Promise<T> => {
    if (inFlightPromise) {
      if (inFlightSnapshot === snapshot) return inFlightPromise
      return inFlightPromise.then(() => run(snapshot, save), () => run(snapshot, save))
    }

    const promise = save().finally(() => {
      if (inFlightPromise === promise) {
        inFlightPromise = null
        inFlightSnapshot = null
      }
    })

    inFlightSnapshot = snapshot
    inFlightPromise = promise
    return promise
  }

  return { run }
}
