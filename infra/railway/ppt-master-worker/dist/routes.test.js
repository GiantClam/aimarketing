import assert from "node:assert/strict";
import test from "node:test";
import { routeRequest, setWorkerRouteDepsForTests } from "./routes.js";
test.afterEach(() => {
    setWorkerRouteDepsForTests(null);
    delete process.env.PPT_WORKER_INTERNAL_TOKEN;
});
test("worker health route returns ok", async () => {
    const response = await routeRequest(new Request("http://worker.local/health", { method: "GET" }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, { ok: true, service: "ppt-master-worker" });
});
test("worker fonts route returns injected font status", async () => {
    setWorkerRouteDepsForTests({
        checkFonts: async () => ({
            requiredFonts: ["Noto Sans CJK SC"],
            missing: [],
        }),
    });
    const response = await routeRequest(new Request("http://worker.local/fonts/check", { method: "GET" }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, {
        requiredFonts: ["Noto Sans CJK SC"],
        missing: [],
    });
});
test("worker rejects unauthorized requests when token is configured", async () => {
    process.env.PPT_WORKER_INTERNAL_TOKEN = "secret-token";
    const response = await routeRequest(new Request("http://worker.local/health", { method: "GET" }));
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.message, "unauthorized");
});
test("worker preview route validates payload and calls preview executor", async () => {
    let seenRequestId = "";
    setWorkerRouteDepsForTests({
        runPreviewJob: async (request) => {
            seenRequestId = request.requestId;
            return {
                previewSessionId: "session_1",
                generatedAt: "2026-06-24T00:00:00.000Z",
                deck: {
                    title: "Deck",
                },
            };
        },
    });
    const response = await routeRequest(new Request("http://worker.local/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            requestId: "req_1",
            prompt: "Build deck",
            scenario: "sales-deck",
            language: "zh-CN",
            templateMode: "auto-4",
            runtimeProfile: "railway-linux",
        }),
    }));
    assert.equal(response.status, 200);
    assert.equal(seenRequestId, "req_1");
    const payload = await response.json();
    assert.equal(payload.previewSessionId, "session_1");
});
test("worker export route validates payload and calls export executor", async () => {
    let seenVariantKey = "";
    setWorkerRouteDepsForTests({
        runExportJob: async (request) => {
            seenVariantKey = request.selectedVariantKey;
            return {
                fileName: "deck.pptx",
                contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                slideCount: 8,
                variantName: "Variant A",
                bufferBase64: Buffer.from("ppt-bytes").toString("base64"),
            };
        },
    });
    const response = await routeRequest(new Request("http://worker.local/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            requestId: "req_2",
            previewSessionId: "session_1",
            selectedVariantKey: "variant_a",
        }),
    }));
    assert.equal(response.status, 200);
    assert.equal(seenVariantKey, "variant_a");
    const payload = await response.json();
    assert.equal(payload.fileName, "deck.pptx");
});
test("worker returns 400 for invalid preview payload", async () => {
    const response = await routeRequest(new Request("http://worker.local/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            requestId: "",
        }),
    }));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.message, "bad_request");
    assert.ok(Array.isArray(payload.issues));
});
