export type BillingKitSessionUser = {
  id: number
  email: string
  enterpriseId: number | null
}

export type BillingKitAuthSuccess = {
  user: BillingKitSessionUser
}

export type BillingKitAuthFailure = {
  response: unknown
}

export type BillingKitAuthResult = BillingKitAuthSuccess | BillingKitAuthFailure

export type BillingKitRequireSessionUser = (request: unknown) => Promise<BillingKitAuthResult>

export type BillingKitUserLookup = (userId: number) => Promise<BillingKitSessionUser | null>

export type BillingKitDbQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[]
}

export type BillingKitDbQueryable = {
  query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<BillingKitDbQueryResult<Row>>
}

export type BillingKitDbClient = BillingKitDbQueryable & {
  release: () => void
}

export type BillingKitDbPool = BillingKitDbQueryable & {
  connect: () => Promise<BillingKitDbClient>
}

export type BillingKitI18nMessages = {
  billing: Record<string, string>
}

export type BillingKitI18nHookResult = {
  locale: string
  messages: BillingKitI18nMessages
}

export type BillingKitUseI18n = () => BillingKitI18nHookResult

