const writerAssetTaskState = globalThis as typeof globalThis & {
  __writerAssetTaskState__?: {
    active: boolean
    waiters: Array<() => void>
  }
}

const state = writerAssetTaskState.__writerAssetTaskState__ || {
  active: false,
  waiters: [],
}
writerAssetTaskState.__writerAssetTaskState__ = state

async function acquireWriterAssetTaskSlot() {
  if (state.active) {
    await new Promise<void>((resolve) => state.waiters.push(resolve))
  }
  state.active = true
}

function releaseWriterAssetTaskSlot() {
  const next = state.waiters.shift()
  if (next) {
    next()
    return
  }
  state.active = false
}

export async function withWriterAssetTaskSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireWriterAssetTaskSlot()
  try {
    return await task()
  } finally {
    releaseWriterAssetTaskSlot()
  }
}
