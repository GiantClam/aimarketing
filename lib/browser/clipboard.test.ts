import assert from "node:assert/strict"
import test from "node:test"

import { copyTextToClipboard } from "@/lib/browser/clipboard"

test("copyTextToClipboard uses navigator clipboard when available", async () => {
  const originalNavigator = globalThis.navigator
  const calls: string[] = []

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (value: string) => {
          calls.push(value)
        },
      },
    },
  })

  try {
    await copyTextToClipboard("hello world")
    assert.deepEqual(calls, ["hello world"])
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    })
  }
})

test("copyTextToClipboard falls back to document.execCommand", async () => {
  const originalNavigator = globalThis.navigator
  const originalDocument = globalThis.document

  const appended: Array<{ removed: boolean; value: string }> = []
  let execCommandCalls = 0
  let focused = false
  let selected = false

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  })

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        appendChild(node: { removed: boolean; value: string }) {
          appended.push(node)
        },
      },
      createElement() {
        return {
          value: "",
          style: {},
          setAttribute() {},
          focus() {
            focused = true
          },
          select() {
            selected = true
          },
          setSelectionRange() {},
          remove() {
            this.removed = true
          },
        }
      },
      execCommand(command: string) {
        execCommandCalls += 1
        return command === "copy"
      },
    },
  })

  try {
    await copyTextToClipboard("fallback copy")
    assert.equal(execCommandCalls, 1)
    assert.equal(appended.length, 1)
    assert.equal(appended[0]?.value, "fallback copy")
    assert.equal(appended[0]?.removed, true)
    assert.equal(focused, true)
    assert.equal(selected, true)
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    })
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    })
  }
})

test("copyTextToClipboard falls back when navigator clipboard rejects", async () => {
  const originalNavigator = globalThis.navigator
  const originalDocument = globalThis.document

  const appended: Array<{ removed: boolean; value: string }> = []
  let execCommandCalls = 0

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error("NotAllowedError")
        },
      },
    },
  })

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        appendChild(node: { removed: boolean; value: string }) {
          appended.push(node)
        },
      },
      createElement() {
        return {
          value: "",
          style: {},
          setAttribute() {},
          focus() {},
          select() {},
          setSelectionRange() {},
          remove() {
            this.removed = true
          },
        }
      },
      execCommand(command: string) {
        execCommandCalls += 1
        return command === "copy"
      },
    },
  })

  try {
    await copyTextToClipboard("fallback after rejection")
    assert.equal(execCommandCalls, 1)
    assert.equal(appended.length, 1)
    assert.equal(appended[0]?.value, "fallback after rejection")
    assert.equal(appended[0]?.removed, true)
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    })
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    })
  }
})
