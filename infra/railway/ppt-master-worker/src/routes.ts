import { ZodError } from "zod"

import { checkFonts } from "./fonts.js"
import type { PptPreviewJobStore } from "./job-store.js"
import { enqueuePreviewJob, getPreviewJobStatus, setPreviewJobDepsForTests } from "./preview-jobs.js"
import { runExportJob, runPreviewJob } from "./ppt-master-executor.js"
import { exportRequestSchema, previewRequestSchema } from "./types.js"

let checkFontsImpl = checkFonts
let runExportJobImpl = runExportJob

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

function validateAuthorization(request: Request) {
  const token = process.env.PPT_WORKER_INTERNAL_TOKEN?.trim()

  if (!token) {
    return true
  }

  return request.headers.get("authorization") === `Bearer ${token}`
}

export async function routeRequest(request: Request) {
  if (!validateAuthorization(request)) {
    return json({ message: "unauthorized" }, 401)
  }

  const url = new URL(request.url)

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "ppt-master-worker" })
  }

  if (request.method === "GET" && url.pathname === "/fonts/check") {
    return json(await checkFontsImpl())
  }

  try {
    if (request.method === "POST" && url.pathname === "/preview") {
      const payload = previewRequestSchema.parse(await request.json())
      return json(await enqueuePreviewJob(payload), 202)
    }

    if (request.method === "GET" && url.pathname.startsWith("/preview-jobs/")) {
      const jobId = url.pathname.replace(/^\/preview-jobs\//u, "").trim()
      if (!jobId) {
        return json({ message: "bad_request" }, 400)
      }

      const status = await getPreviewJobStatus(jobId)
      if (!status) {
        return json({ message: "not_found" }, 404)
      }

      return json(status)
    }

    if (request.method === "POST" && url.pathname === "/export") {
      const payload = exportRequestSchema.parse(await request.json())
      return json(await runExportJobImpl(payload))
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          message: "bad_request",
          issues: error.issues,
        },
        400,
      )
    }

    const message = error instanceof Error && error.message ? error.message : "worker_internal_error"
    return json({ message }, 500)
  }

  return json({ message: "not_found" }, 404)
}

export function setWorkerRouteDepsForTests(
  deps:
    | {
        checkFonts?: typeof checkFonts
        runPreviewJob?: typeof runPreviewJob
        runExportJob?: typeof runExportJob
        previewJobStore?: PptPreviewJobStore
      }
    | null,
) {
  checkFontsImpl = deps?.checkFonts ?? checkFonts
  runExportJobImpl = deps?.runExportJob ?? runExportJob
  setPreviewJobDepsForTests({
    runPreviewJob: deps?.runPreviewJob,
    previewJobStore: deps?.previewJobStore,
  })
}
