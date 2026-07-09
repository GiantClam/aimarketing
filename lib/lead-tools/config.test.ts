import assert from "node:assert/strict"
import test from "node:test"

import {
  allowPptMasterEmergencyFallback,
  getLeadToolPptExecutionTransport,
  getLeadToolPptPreviewRuntime,
  getLeadToolPptPreviewProvider,
  getLeadToolPptRuntimeSlideModel,
  getLeadToolPptRuntimeSlideProvider,
  getPptMasterSlideTimeoutMs,
  getPptWorkerBaseUrl,
  getPptWorkerInternalToken,
  getPptWorkerPreviewMaxAttempts,
  getPptWorkerPreviewPollIntervalMs,
  getPptWorkerPreviewRetryDelayMs,
  getPptWorkerPreviewTimeoutMs,
  getPptWorkerRuntimeProfile,
} from "./config"

test("ai-ppt-preview defaults to frontend-slides preview runtime", () => {
  const originalPreviewRuntime = process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
  const originalGlobalRuntime = process.env.LEAD_TOOLS_PREVIEW_RUNTIME
  const originalWorkerBaseUrl = process.env.PPT_WORKER_BASE_URL

  try {
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME
    delete process.env.PPT_WORKER_BASE_URL

    assert.equal(getLeadToolPptPreviewRuntime("ai-ppt-preview"), "frontend-slides-agent")
  } finally {
    if (originalPreviewRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME = originalPreviewRuntime
    }

    if (originalGlobalRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PREVIEW_RUNTIME = originalGlobalRuntime
    }

    if (originalWorkerBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = originalWorkerBaseUrl
    }
  }
})

test("ppt execution transport defaults to local", () => {
  const previousTransport = process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL

  try {
    delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
    delete process.env.PPT_WORKER_BASE_URL

    assert.equal(getLeadToolPptExecutionTransport(), "local")
  } finally {
    if (previousTransport === undefined) {
      delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
    } else {
      process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = previousTransport
    }

    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }
  }
})

test("ppt worker config reads base url token and runtime profile", () => {
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousToken = process.env.PPT_WORKER_INTERNAL_TOKEN
  const previousProfile = process.env.PPT_WORKER_RUNTIME_PROFILE
  const previousPollInterval = process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
  const previousTimeout = process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS
  const previousMaxAttempts = process.env.PPT_WORKER_PREVIEW_MAX_ATTEMPTS
  const previousRetryDelay = process.env.PPT_WORKER_PREVIEW_RETRY_DELAY_MS

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com/"
    process.env.PPT_WORKER_INTERNAL_TOKEN = "secret-token"
    process.env.PPT_WORKER_RUNTIME_PROFILE = "railway-linux"
    process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = "1500"
    process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = "120000"
    process.env.PPT_WORKER_PREVIEW_MAX_ATTEMPTS = "3"
    process.env.PPT_WORKER_PREVIEW_RETRY_DELAY_MS = "750"

    assert.equal(getPptWorkerBaseUrl(), "https://ppt-worker.example.com/")
    assert.equal(getPptWorkerInternalToken(), "secret-token")
    assert.equal(getPptWorkerRuntimeProfile(), "railway-linux")
    assert.equal(getPptWorkerPreviewPollIntervalMs(), 1500)
    assert.equal(getPptWorkerPreviewTimeoutMs(), 120000)
    assert.equal(getPptWorkerPreviewMaxAttempts(), 3)
    assert.equal(getPptWorkerPreviewRetryDelayMs(), 750)
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousToken === undefined) {
      delete process.env.PPT_WORKER_INTERNAL_TOKEN
    } else {
      process.env.PPT_WORKER_INTERNAL_TOKEN = previousToken
    }

    if (previousProfile === undefined) {
      delete process.env.PPT_WORKER_RUNTIME_PROFILE
    } else {
      process.env.PPT_WORKER_RUNTIME_PROFILE = previousProfile
    }

    if (previousPollInterval === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = previousPollInterval
    }

    if (previousTimeout === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = previousTimeout
    }

    if (previousMaxAttempts === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_MAX_ATTEMPTS
    } else {
      process.env.PPT_WORKER_PREVIEW_MAX_ATTEMPTS = previousMaxAttempts
    }

    if (previousRetryDelay === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_RETRY_DELAY_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_RETRY_DELAY_MS = previousRetryDelay
    }
  }
})

test("ppt worker runtime profile infers railway-linux from a railway worker url", () => {
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousProfile = process.env.PPT_WORKER_RUNTIME_PROFILE

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-master-worker-production.up.railway.app"
    delete process.env.PPT_WORKER_RUNTIME_PROFILE

    assert.equal(getPptWorkerRuntimeProfile(), "railway-linux")
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousProfile === undefined) {
      delete process.env.PPT_WORKER_RUNTIME_PROFILE
    } else {
      process.env.PPT_WORKER_RUNTIME_PROFILE = previousProfile
    }
  }
})

test("ppt worker base url upgrades preview runtime and transport defaults", () => {
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousTransport = process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
  const previousPreviewRuntime = process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
  const previousGlobalRuntime = process.env.LEAD_TOOLS_PREVIEW_RUNTIME

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com/"
    delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME

    assert.equal(getLeadToolPptExecutionTransport(), "remote-worker")
    assert.equal(getLeadToolPptPreviewRuntime("ai-ppt-preview"), "ppt-master-agent")
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousTransport === undefined) {
      delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
    } else {
      process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = previousTransport
    }

    if (previousPreviewRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME = previousPreviewRuntime
    }

    if (previousGlobalRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PREVIEW_RUNTIME = previousGlobalRuntime
    }
  }
})

test("ppt runtime slide config prefers explicit overrides and disables emergency fallback by default", () => {
  const previousTimeout = process.env.PPT_MASTER_SLIDE_TIMEOUT_MS
  const previousFallback = process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK
  const previousRuntimeSlideModel = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  const previousRuntimeSlideProvider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
  const previousPreviewProvider = process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER

  try {
    delete process.env.PPT_MASTER_SLIDE_TIMEOUT_MS
    delete process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER

    assert.equal(getPptMasterSlideTimeoutMs(), 12 * 60 * 1000)
    assert.equal(allowPptMasterEmergencyFallback(), false)
    assert.equal(getLeadToolPptRuntimeSlideModel(), "gpt-5.4")
    assert.equal(getLeadToolPptRuntimeSlideProvider(), "")
    assert.equal(getLeadToolPptPreviewProvider(), "")

    process.env.PPT_MASTER_SLIDE_TIMEOUT_MS = "720000"
    process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK = "true"
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = "gpt-5.4"
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = "glm"
    process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER = "minimax"

    assert.equal(getPptMasterSlideTimeoutMs(), 720000)
    assert.equal(allowPptMasterEmergencyFallback(), true)
    assert.equal(getLeadToolPptRuntimeSlideModel(), "gpt-5.4")
    assert.equal(getLeadToolPptRuntimeSlideProvider(), "glm")
    assert.equal(getLeadToolPptPreviewProvider(), "minimax")
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.PPT_MASTER_SLIDE_TIMEOUT_MS
    } else {
      process.env.PPT_MASTER_SLIDE_TIMEOUT_MS = previousTimeout
    }

    if (previousFallback === undefined) {
      delete process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK
    } else {
      process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK = previousFallback
    }

    if (previousRuntimeSlideModel === undefined) {
      delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
    } else {
      process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = previousRuntimeSlideModel
    }

    if (previousRuntimeSlideProvider === undefined) {
      delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
    } else {
      process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = previousRuntimeSlideProvider
    }

    if (previousPreviewProvider === undefined) {
      delete process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER
    } else {
      process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER = previousPreviewProvider
    }
  }
})
