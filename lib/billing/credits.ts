import type { BillingFeatureKey } from "@/lib/billing/costing"

export type CreditLedgerEntryType = "grant" | "reserve" | "release" | "debit" | "refund" | "adjustment"

export type CreditLedgerEntry = {
  id: string
  creditAccountId: string
  enterpriseId?: number | null
  userId?: number | null
  entryType: CreditLedgerEntryType
  featureKey?: BillingFeatureKey | string | null
  amount: number
  balanceAfter: number
  reservedBalanceAfter: number
  idempotencyKey: string
  provider?: string | null
  model?: string | null
  officialCostUsd?: number | null
  costBasisUsd?: number | null
  usagePayload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  createdAt: Date
}

export type CreditAccountState = {
  creditAccountId: string
  enterpriseId?: number | null
  balance: number
  reservedBalance: number
  ledger: CreditLedgerEntry[]
}

export function createCreditAccountState(input: {
  creditAccountId: string
  enterpriseId?: number | null
  initialBalance?: number | null
}): CreditAccountState {
  return {
    creditAccountId: input.creditAccountId,
    enterpriseId: input.enterpriseId || null,
    balance: Math.max(0, Math.floor(input.initialBalance || 0)),
    reservedBalance: 0,
    ledger: [],
  }
}

export function getAvailableCredits(account: CreditAccountState) {
  return Math.max(0, account.balance - account.reservedBalance)
}

function assertPositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("credit_amount_must_be_positive")
  }
  return Math.ceil(amount)
}

function findByIdempotency(account: CreditAccountState, idempotencyKey: string) {
  return account.ledger.find((entry) => entry.idempotencyKey === idempotencyKey) || null
}

function appendEntry(
  account: CreditAccountState,
  entry: Omit<CreditLedgerEntry, "id" | "creditAccountId" | "enterpriseId" | "balanceAfter" | "reservedBalanceAfter" | "createdAt">,
  next: { balance: number; reservedBalance: number },
) {
  const existing = findByIdempotency(account, entry.idempotencyKey)
  if (existing) return { account, entry: existing, idempotent: true }

  const ledgerEntry: CreditLedgerEntry = {
    ...entry,
    id: `${account.creditAccountId}:${account.ledger.length + 1}`,
    creditAccountId: account.creditAccountId,
    enterpriseId: account.enterpriseId || null,
    balanceAfter: next.balance,
    reservedBalanceAfter: next.reservedBalance,
    createdAt: new Date(),
  }

  return {
    account: {
      ...account,
      balance: next.balance,
      reservedBalance: next.reservedBalance,
      ledger: [...account.ledger, ledgerEntry],
    },
    entry: ledgerEntry,
    idempotent: false,
  }
}

export function grantCredits(
  account: CreditAccountState,
  input: {
    amount: number
    idempotencyKey: string
    subscriptionId?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  const amount = assertPositiveAmount(input.amount)
  return appendEntry(
    account,
    {
      entryType: "grant",
      amount,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata || (input.subscriptionId ? { subscriptionId: input.subscriptionId } : null),
    },
    {
      balance: account.balance + amount,
      reservedBalance: account.reservedBalance,
    },
  )
}

export function reserveCredits(
  account: CreditAccountState,
  input: {
    userId: number
    featureKey: BillingFeatureKey | string
    amount: number
    idempotencyKey: string
    metadata?: Record<string, unknown> | null
  },
) {
  const amount = assertPositiveAmount(input.amount)
  const existing = findByIdempotency(account, input.idempotencyKey)
  if (existing) return { account, entry: existing, idempotent: true }
  if (getAvailableCredits(account) < amount) {
    throw new Error("insufficient_credits")
  }

  return appendEntry(
    account,
    {
      entryType: "reserve",
      userId: input.userId,
      featureKey: input.featureKey,
      amount,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata || null,
    },
    {
      balance: account.balance,
      reservedBalance: account.reservedBalance + amount,
    },
  )
}

export function releaseCreditReserve(
  account: CreditAccountState,
  input: {
    reserveIdempotencyKey: string
    idempotencyKey: string
    reason?: string | null
  },
) {
  const reserve = account.ledger.find(
    (entry) => entry.entryType === "reserve" && entry.idempotencyKey === input.reserveIdempotencyKey,
  )
  if (!reserve) {
    throw new Error("credit_reserve_not_found")
  }

  return appendEntry(
    account,
    {
      entryType: "release",
      userId: reserve.userId,
      featureKey: reserve.featureKey,
      amount: reserve.amount,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        reserveId: reserve.id,
        reason: input.reason || "task_failed",
      },
    },
    {
      balance: account.balance,
      reservedBalance: Math.max(0, account.reservedBalance - reserve.amount),
    },
  )
}

export function finalizeCreditDebit(
  account: CreditAccountState,
  input: {
    reserveIdempotencyKey: string
    idempotencyKey: string
    actualAmount?: number | null
    provider?: string | null
    model?: string | null
    officialCostUsd?: number | null
    costBasisUsd?: number | null
    usagePayload?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
  },
) {
  const reserve = account.ledger.find(
    (entry) => entry.entryType === "reserve" && entry.idempotencyKey === input.reserveIdempotencyKey,
  )
  if (!reserve) {
    throw new Error("credit_reserve_not_found")
  }

  const actualAmount = Math.min(
    reserve.amount,
    assertPositiveAmount(input.actualAmount || reserve.amount),
  )

  return appendEntry(
    account,
    {
      entryType: "debit",
      userId: reserve.userId,
      featureKey: reserve.featureKey,
      amount: -actualAmount,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider || null,
      model: input.model || null,
      officialCostUsd: input.officialCostUsd || null,
      costBasisUsd: input.costBasisUsd || null,
      usagePayload: input.usagePayload || null,
      metadata: {
        ...(input.metadata || {}),
        reserveId: reserve.id,
      },
    },
    {
      balance: Math.max(0, account.balance - actualAmount),
      reservedBalance: Math.max(0, account.reservedBalance - reserve.amount),
    },
  )
}
