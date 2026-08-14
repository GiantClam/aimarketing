import assert from "node:assert/strict";
import test from "node:test";

import { compareWriterQuality } from "./compare-writer-quality.mjs";

function dataset(scores) {
  return {
    schemaVersion: 1,
    corpusId: "writer-v1-corpus",
    samples: [
      { id: "sample-1", prompt: "Write a factual launch note", platform: "wechat", blind: true, ...scores[0] },
      { id: "sample-2", prompt: "Revise the launch note for X", platform: "x", blind: true, ...scores[1] },
    ],
  };
}

test("Writer quality comparison passes only with no factuality/compliance regression and editorial improvement", () => {
  const result = compareWriterQuality(
    dataset([{ factuality: 4, compliance: 4, editorial: 3 }, { factuality: 3, compliance: 4, editorial: 3 }]),
    dataset([{ factuality: 4, compliance: 4.5, editorial: 4 }, { factuality: 3.5, compliance: 4, editorial: 3.5 }]),
  );
  assert.equal(result.status, "pass");
  assert.deepEqual(result.gate, { factualityNoRegression: true, platformComplianceNoRegression: true, blindEditorialImproved: true });
  assert.equal(result.metrics.editorial.delta, 0.75);
});

test("Writer quality comparison fails closed on editorial tie or any regression", () => {
  const result = compareWriterQuality(
    dataset([{ factuality: 4, compliance: 4, editorial: 3 }, { factuality: 3, compliance: 4, editorial: 3 }]),
    dataset([{ factuality: 4, compliance: 4, editorial: 3 }, { factuality: 2.5, compliance: 4, editorial: 3 }]),
  );
  assert.equal(result.status, "changes_required");
  assert.equal(result.gate.factualityNoRegression, false);
  assert.equal(result.gate.blindEditorialImproved, false);
});

test("Writer quality comparison rejects non-blind or mismatched prompt evidence", () => {
  const baseline = dataset([{ factuality: 4, compliance: 4, editorial: 3 }, { factuality: 3, compliance: 4, editorial: 3 }]);
  assert.throws(() => compareWriterQuality({ ...baseline, samples: [{ ...baseline.samples[0], blind: false }, baseline.samples[1]] }, baseline), /not_blind/u);
  assert.throws(() => compareWriterQuality(baseline, { ...baseline, samples: [{ ...baseline.samples[0], prompt: "different" }, baseline.samples[1]] }), /context_mismatch/u);
});
