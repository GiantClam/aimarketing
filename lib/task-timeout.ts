export async function withTaskTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
  options: { abortController?: AbortController } = {},
) {
  if (timeoutMs <= 0) {
    return promise
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(errorMessage))
          options.abortController?.abort()
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
