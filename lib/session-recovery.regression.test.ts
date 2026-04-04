import assert from "node:assert/strict"
import test from "node:test"

import { buildSessionRecoveryPlan } from "./session-recovery"

test("empty cache shows loading and uses foreground reconcile", () => {
  const plan = buildSessionRecoveryPlan({
    hasCache: false,
    hasVisibleContent: false,
  })

  assert.equal(plan.hasCache, false)
  assert.equal(plan.showLoadingState, true)
  assert.equal(plan.reconcileInBackground, false)
  assert.equal(plan.keepCurrentOnError, false)
  assert.equal(plan.forceRefresh, false)
})

test("cache with content renders immediately and reconciles in background", () => {
  const plan = buildSessionRecoveryPlan({
    hasCache: true,
    hasVisibleContent: true,
  })

  assert.equal(plan.hasCache, true)
  assert.equal(plan.showLoadingState, false)
  assert.equal(plan.reconcileInBackground, true)
  assert.equal(plan.keepCurrentOnError, true)
  assert.equal(plan.forceRefresh, true)
})

test("cache without visible content still shows loading but keeps background reconcile", () => {
  const plan = buildSessionRecoveryPlan({
    hasCache: true,
    hasVisibleContent: false,
  })

  assert.equal(plan.showLoadingState, true)
  assert.equal(plan.reconcileInBackground, true)
  assert.equal(plan.keepCurrentOnError, true)
  assert.equal(plan.forceRefresh, true)
})

test("explicit force refresh is respected without cache", () => {
  const plan = buildSessionRecoveryPlan({
    hasCache: false,
    hasVisibleContent: false,
    forceRefresh: true,
  })

  assert.equal(plan.showLoadingState, true)
  assert.equal(plan.reconcileInBackground, false)
  assert.equal(plan.forceRefresh, true)
})

