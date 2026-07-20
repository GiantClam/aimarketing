import { sql } from "drizzle-orm"
import { pgTable, serial, integer, varchar, text, timestamp, boolean, uniqueIndex, jsonb, real, index, uuid, check } from "drizzle-orm/pg-core"

const withPrefix = (name: string) => `AI_MARKETING_${name}`

// Enterprise table
export const enterprises = pgTable(withPrefix("enterprises"), {
  id: serial("id").primaryKey(),
  enterpriseCode: varchar("enterprise_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Users table
export const users = pgTable(withPrefix("users"), {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }),
  emailVerified: boolean("email_verified").default(true).notNull(),
  enterpriseId: integer("enterprise_id").references(() => enterprises.id),
  enterpriseRole: varchar("enterprise_role", { length: 20 }).default("member"), // admin, member
  enterpriseStatus: varchar("enterprise_status", { length: 20 }).default("active"), // active, pending, rejected
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const userSessions = pgTable(
  withPrefix("user_sessions"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex(withPrefix("user_sessions_token_hash_idx")).on(table.tokenHash),
  }),
)

export const passwordResetTokens = pgTable(
  withPrefix("password_reset_tokens"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    requestedIp: varchar("requested_ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex(withPrefix("password_reset_tokens_token_hash_idx")).on(table.tokenHash),
  }),
)

// Enterprise join requests
export const enterpriseJoinRequests = pgTable(withPrefix("enterprise_join_requests"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  enterpriseId: integer("enterprise_id")
    .notNull()
    .references(() => enterprises.id),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, approved, rejected
  note: text("note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// User feature permissions
export const userFeaturePermissions = pgTable(
  withPrefix("user_feature_permissions"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    featureKey: varchar("feature_key", { length: 100 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userFeatureKeyUnique: uniqueIndex(withPrefix("user_feature_permissions_user_feature_idx")).on(table.userId, table.featureKey),
  }),
)

export const subscriptionPlans = pgTable(
  withPrefix("subscription_plans"),
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    priceUsdCents: integer("price_usd_cents").notNull(),
    monthlyCredits: integer("monthly_credits").notNull(),
    features: jsonb("features").$type<Record<string, unknown>>().default({}).notNull(),
    paypalPlanId: varchar("paypal_plan_id", { length: 128 }),
    stripePriceId: varchar("stripe_price_id", { length: 128 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex(withPrefix("subscription_plans_code_idx")).on(table.code),
    paypalPlanIdx: index(withPrefix("subscription_plans_paypal_plan_idx")).on(table.paypalPlanId),
    stripePriceIdx: index(withPrefix("subscription_plans_stripe_price_idx")).on(table.stripePriceId),
  }),
)

export const userSubscriptions = pgTable(
  withPrefix("user_subscriptions"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    subscribedByUserId: integer("subscribed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    planCode: varchar("plan_code", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    paymentProvider: varchar("payment_provider", { length: 24 }),
    paypalSubscriptionId: varchar("paypal_subscription_id", { length: 128 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 128 }),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 128 }),
    nextPlanCode: varchar("next_plan_code", { length: 32 }),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseStatusIdx: index(withPrefix("user_subscriptions_enterprise_status_idx")).on(table.enterpriseId, table.status),
    providerIdx: index(withPrefix("user_subscriptions_provider_idx")).on(table.paymentProvider),
    paypalSubscriptionUnique: uniqueIndex(withPrefix("user_subscriptions_paypal_subscription_idx")).on(
      table.paypalSubscriptionId,
    ),
    stripeSubscriptionUnique: uniqueIndex(withPrefix("user_subscriptions_stripe_subscription_idx")).on(
      table.stripeSubscriptionId,
    ),
    stripeCheckoutSessionUnique: uniqueIndex(withPrefix("user_subscriptions_stripe_checkout_session_idx")).on(
      table.stripeCheckoutSessionId,
    ),
  }),
)

export const creditAccounts = pgTable(
  withPrefix("credit_accounts"),
  {
    id: serial("id").primaryKey(),
    accountType: varchar("account_type", { length: 24 }).default("enterprise").notNull(),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").default(0).notNull(),
    reservedBalance: integer("reserved_balance").default(0).notNull(),
    monthlyGrantBalance: integer("monthly_grant_balance").default(0).notNull(),
    purchasedBalance: integer("purchased_balance").default(0).notNull(),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseIdx: index(withPrefix("credit_accounts_enterprise_idx")).on(table.enterpriseId),
    ownerUserIdx: index(withPrefix("credit_accounts_owner_user_idx")).on(table.ownerUserId),
  }),
)

export const creditLedger = pgTable(
  withPrefix("credit_ledger"),
  {
    id: serial("id").primaryKey(),
    creditAccountId: integer("credit_account_id")
      .notNull()
      .references(() => creditAccounts.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    subscriptionId: integer("subscription_id").references(() => userSubscriptions.id, { onDelete: "set null" }),
    entryType: varchar("entry_type", { length: 24 }).notNull(),
    featureKey: varchar("feature_key", { length: 80 }),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reservedBalanceAfter: integer("reserved_balance_after").default(0).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    provider: varchar("provider", { length: 40 }),
    model: varchar("model", { length: 160 }),
    officialCostUsd: real("official_cost_usd"),
    costBasisUsd: real("cost_basis_usd"),
    usagePayload: jsonb("usage_payload").$type<Record<string, unknown> | null>(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(withPrefix("credit_ledger_account_idempotency_idx")).on(
      table.creditAccountId,
      table.idempotencyKey,
    ),
    accountCreatedIdx: index(withPrefix("credit_ledger_account_created_idx")).on(table.creditAccountId, table.createdAt),
    userCreatedIdx: index(withPrefix("credit_ledger_user_created_idx")).on(table.userId, table.createdAt),
  }),
)

export const paypalWebhookEvents = pgTable(
  withPrefix("paypal_webhook_events"),
  {
    id: serial("id").primaryKey(),
    paypalEventId: varchar("paypal_event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 96 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    paypalEventUnique: uniqueIndex(withPrefix("paypal_webhook_events_event_idx")).on(table.paypalEventId),
    resourceIdx: index(withPrefix("paypal_webhook_events_resource_idx")).on(table.resourceId),
  }),
)

export const stripeWebhookEvents = pgTable(
  withPrefix("stripe_webhook_events"),
  {
    id: serial("id").primaryKey(),
    stripeEventId: varchar("stripe_event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 96 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    stripeEventUnique: uniqueIndex(withPrefix("stripe_webhook_events_event_idx")).on(table.stripeEventId),
    resourceIdx: index(withPrefix("stripe_webhook_events_resource_idx")).on(table.resourceId),
  }),
)

// User files table for personal knowledge base
export const userFiles = pgTable(withPrefix("user_files"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  storageKey: text("storage_key").notNull().unique(), // Key in R2/S3 bucket
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, indexing, ready, failed
  createdAt: timestamp("created_at").defaultNow(),
})

// Conversations table for chat history
export const conversations = pgTable(withPrefix("conversations"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  currentModelId: varchar("current_model_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow(),
})

// Messages table for conversation history
export const messages = pgTable(withPrefix("messages"), {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  knowledgeSource: varchar("knowledge_source", { length: 50 }), // 'industry_kb' or 'personal_kb'
  createdAt: timestamp("created_at").defaultNow(),
})

// Writer conversations table for article writing workspace
export const writerConversations = pgTable(withPrefix("writer_conversations"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  enterpriseId: integer("enterprise_id").references(() => enterprises.id),
  title: varchar("title", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 32 }).default("wechat").notNull(),
  mode: varchar("mode", { length: 32 }).default("article").notNull(),
  language: varchar("language", { length: 32 }).default("auto").notNull(),
  status: varchar("status", { length: 32 }).default("drafting").notNull(),
  imagesRequested: boolean("images_requested").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Writer messages table for article writing workspace
export const writerMessages = pgTable(withPrefix("writer_messages"), {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => writerConversations.id),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  diagnostics: jsonb("diagnostics"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const writerSoulProfiles = pgTable(
  withPrefix("writer_soul_profiles"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    agentType: varchar("agent_type", { length: 32 }).notNull(),
    tone: text("tone").default("").notNull(),
    sentenceStyle: text("sentence_style").default("").notNull(),
    tabooList: jsonb("taboo_list").$type<string[]>().default([]).notNull(),
    lexicalHints: jsonb("lexical_hints").$type<string[]>().default([]).notNull(),
    confidence: real("confidence").default(0.5).notNull(),
    version: varchar("version", { length: 32 }).default("v1").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userAgentTypeUnique: uniqueIndex(withPrefix("writer_soul_profiles_user_agent_type_idx")).on(
      table.userId,
      table.agentType,
    ),
  }),
)

export const writerMemoryItems = pgTable(
  withPrefix("writer_memory_items"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    agentType: varchar("agent_type", { length: 32 }).notNull(),
    conversationId: integer("conversation_id").references(() => writerConversations.id),
    type: varchar("type", { length: 24 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    content: text("content").notNull(),
    confidence: real("confidence").default(0.5).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    dedupFingerprint: varchar("dedup_fingerprint", { length: 128 }),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    lastUsedAt: timestamp("last_used_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userAgentUpdatedIdx: index(withPrefix("writer_memory_items_user_agent_updated_idx")).on(
      table.userId,
      table.agentType,
      table.updatedAt,
    ),
    userAgentTypeDedupIdx: index(withPrefix("writer_memory_items_user_agent_type_dedup_idx")).on(
      table.userId,
      table.agentType,
      table.type,
      table.dedupFingerprint,
    ),
  }),
)

export const writerMemoryEvents = pgTable(
  withPrefix("writer_memory_events"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    agentType: varchar("agent_type", { length: 32 }).notNull(),
    memoryItemId: integer("memory_item_id").references(() => writerMemoryItems.id),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userAgentCreatedIdx: index(withPrefix("writer_memory_events_user_agent_created_idx")).on(
      table.userId,
      table.agentType,
      table.createdAt,
    ),
  }),
)

export const leadHunterConversations = pgTable(withPrefix("lead_hunter_conversations"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  advisorType: varchar("advisor_type", { length: 32 }).default("company-search").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const rateLimitBuckets = pgTable(withPrefix("rate_limit_buckets"), {
  bucketKey: varchar("bucket_key", { length: 255 }).primaryKey(),
  count: integer("count").default(0).notNull(),
  resetAt: timestamp("reset_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const leadHunterMessages = pgTable(
  withPrefix("lead_hunter_messages"),
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => leadHunterConversations.id),
    query: text("query").notNull(),
    answer: text("answer").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
)

export const emailVerificationTokens = pgTable(
  withPrefix("email_verification_tokens"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex(withPrefix("email_verification_tokens_token_hash_idx")).on(table.tokenHash),
  }),
)

export const leadHunterEvidences = pgTable(
  withPrefix("lead_hunter_evidences"),
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => leadHunterConversations.id, { onDelete: "cascade" }),
    messageId: integer("message_id")
      .notNull()
      .references(() => leadHunterMessages.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceProvider: varchar("source_provider", { length: 32 }).notNull(),
    extractedBy: varchar("extracted_by", { length: 32 }).notNull(),
    confidence: varchar("confidence", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    messageIdx: index(withPrefix("lead_hunter_evidences_message_idx")).on(table.messageId, table.id),
    conversationIdx: index(withPrefix("lead_hunter_evidences_conversation_idx")).on(table.conversationId, table.id),
  }),
)

export const enterpriseDifyBindings = pgTable(
  withPrefix("enterprise_dify_bindings"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    baseUrl: text("base_url").notNull(),
    apiKey: varchar("api_key", { length: 500 }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseUnique: uniqueIndex(withPrefix("enterprise_dify_bindings_enterprise_idx")).on(table.enterpriseId),
  }),
)

export const enterpriseDifyDatasets = pgTable(
  withPrefix("enterprise_dify_datasets"),
  {
    id: serial("id").primaryKey(),
    bindingId: integer("binding_id")
      .notNull()
      .references(() => enterpriseDifyBindings.id),
    datasetId: varchar("dataset_id", { length: 255 }).notNull(),
    datasetName: varchar("dataset_name", { length: 255 }).notNull(),
    scope: varchar("scope", { length: 32 }).default("brand").notNull(),
    priority: integer("priority").default(100).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    bindingDatasetUnique: uniqueIndex(withPrefix("enterprise_dify_datasets_binding_dataset_idx")).on(
      table.bindingId,
      table.datasetId,
    ),
  }),
)

export const enterpriseKnowledgeSources = pgTable(
  withPrefix("enterprise_knowledge_sources"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    providerType: varchar("provider_type", { length: 32 }).default("ragflow").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: varchar("api_key", { length: 500 }),
    status: varchar("status", { length: 24 }).default("unavailable").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastCheckedAt: timestamp("last_checked_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseProviderUnique: uniqueIndex(withPrefix("enterprise_knowledge_sources_enterprise_provider_idx")).on(
      table.enterpriseId,
      table.providerType,
    ),
    enterpriseStatusIdx: index(withPrefix("enterprise_knowledge_sources_enterprise_status_idx")).on(
      table.enterpriseId,
      table.status,
    ),
  }),
)

export const enterpriseKnowledgeDatasets = pgTable(
  withPrefix("enterprise_knowledge_datasets"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    sourceId: integer("source_id")
      .notNull()
      .references(() => enterpriseKnowledgeSources.id, { onDelete: "cascade" }),
    providerDatasetId: varchar("provider_dataset_id", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 32 }).default("general").notNull(),
    priority: integer("priority").default(100).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    chunkingConfig: jsonb("chunking_config").$type<Record<string, unknown> | null>(),
    retrievalConfig: jsonb("retrieval_config").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceDatasetUnique: uniqueIndex(withPrefix("enterprise_knowledge_datasets_source_provider_idx")).on(
      table.sourceId,
      table.providerDatasetId,
    ),
    enterpriseCategoryIdx: index(withPrefix("enterprise_knowledge_datasets_enterprise_category_idx")).on(
      table.enterpriseId,
      table.category,
    ),
  }),
)

export const enterpriseKnowledgeDocuments = pgTable(
  withPrefix("enterprise_knowledge_documents"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    sourceId: integer("source_id").references(() => enterpriseKnowledgeSources.id, { onDelete: "set null" }),
    datasetId: integer("dataset_id").references(() => enterpriseKnowledgeDatasets.id, { onDelete: "set null" }),
    providerDocumentId: varchar("provider_document_id", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    sourceType: varchar("source_type", { length: 24 }).notNull(),
    sourceUrl: text("source_url"),
    category: varchar("category", { length: 32 }).default("general").notNull(),
    status: varchar("status", { length: 24 }).default("uploaded").notNull(),
    chunkCount: integer("chunk_count").default(0).notNull(),
    parseSummary: jsonb("parse_summary").$type<Record<string, unknown> | null>(),
    chunkingOverride: jsonb("chunking_override").$type<Record<string, unknown> | null>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseStatusIdx: index(withPrefix("enterprise_knowledge_documents_enterprise_status_idx")).on(
      table.enterpriseId,
      table.status,
    ),
    datasetUpdatedIdx: index(withPrefix("enterprise_knowledge_documents_dataset_updated_idx")).on(
      table.datasetId,
      table.updatedAt,
    ),
  }),
)

export const enterpriseKnowledgeChunks = pgTable(
  withPrefix("enterprise_knowledge_chunks"),
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => enterpriseKnowledgeDocuments.id, { onDelete: "cascade" }),
    providerChunkId: varchar("provider_chunk_id", { length: 255 }),
    chunkIndex: integer("chunk_index").default(0).notNull(),
    content: text("content"),
    excerpt: text("excerpt"),
    keywords: jsonb("keywords").$type<string[] | null>(),
    questions: jsonb("questions").$type<string[] | null>(),
    tags: jsonb("tags").$type<string[] | null>(),
    enabled: boolean("enabled").default(true).notNull(),
    edited: boolean("edited").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    documentChunkUnique: uniqueIndex(withPrefix("enterprise_knowledge_chunks_document_chunk_idx")).on(
      table.documentId,
      table.chunkIndex,
    ),
    documentUpdatedIdx: index(withPrefix("enterprise_knowledge_chunks_document_updated_idx")).on(
      table.documentId,
      table.updatedAt,
    ),
  }),
)

export const enterpriseKnowledgeBindings = pgTable(
  withPrefix("enterprise_knowledge_bindings"),
  {
    id: serial("id").primaryKey(),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => enterpriseKnowledgeDatasets.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 48 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    datasetTargetUnique: uniqueIndex(withPrefix("enterprise_knowledge_bindings_dataset_target_idx")).on(
      table.datasetId,
      table.targetType,
    ),
  }),
)

export const enterpriseDifyAdvisorConfigs = pgTable(
  withPrefix("enterprise_dify_advisor_configs"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    advisorType: varchar("advisor_type", { length: 32 }).notNull(),
    executionMode: varchar("execution_mode", { length: 16 }).default("dify").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: varchar("api_key", { length: 500 }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseAdvisorUnique: uniqueIndex(withPrefix("enterprise_dify_advisors_enterprise_type_idx")).on(
      table.enterpriseId,
      table.advisorType,
    ),
  }),
)

export const enterprisePlatformRegistryConfigs = pgTable(
  withPrefix("enterprise_platform_registry_configs"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    itemSlug: varchar("item_slug", { length: 128 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    publicVisible: boolean("public_visible").default(false).notNull(),
    workspaceVisible: boolean("workspace_visible").default(true).notNull(),
    bindingTarget: varchar("binding_target", { length: 128 }),
    bindingMode: varchar("binding_mode", { length: 32 }).default("existing_runtime").notNull(),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseItemUnique: uniqueIndex(withPrefix("enterprise_platform_registry_configs_enterprise_item_idx")).on(
      table.enterpriseId,
      table.itemType,
      table.itemSlug,
    ),
  }),
)

export const enterprisePlatformAgentCards = pgTable(
  withPrefix("enterprise_platform_agent_cards"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    slug: varchar("slug", { length: 128 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull(),
    focus: varchar("focus", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).default("beta").notNull(),
    publicVisible: boolean("public_visible").default(false).notNull(),
    workspaceVisible: boolean("workspace_visible").default(true).notNull(),
    bindingTarget: varchar("binding_target", { length: 128 }),
    bindingMode: varchar("binding_mode", { length: 32 }).default("existing_runtime").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("enterprise_platform_agent_cards_enterprise_slug_idx")).on(
      table.enterpriseId,
      table.slug,
    ),
  }),
)

export const enterprisePlatformWorkflowTemplates = pgTable(
  withPrefix("enterprise_platform_workflow_templates"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    slug: varchar("slug", { length: 128 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull(),
    trigger: varchar("trigger", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).default("beta").notNull(),
    publicVisible: boolean("public_visible").default(false).notNull(),
    workspaceVisible: boolean("workspace_visible").default(true).notNull(),
    bindingTarget: varchar("binding_target", { length: 128 }),
    bindingMode: varchar("binding_mode", { length: 32 }).default("existing_runtime").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("enterprise_platform_workflow_templates_enterprise_slug_idx")).on(
      table.enterpriseId,
      table.slug,
    ),
  }),
)

export const platformWorkflows = pgTable(
  withPrefix("platform_workflows"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    triggerType: varchar("trigger_type", { length: 24 }).default("manual").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    currentRevision: integer("current_revision").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("platform_workflows_enterprise_slug_idx")).on(table.enterpriseId, table.slug),
    enterpriseUpdatedIdx: index(withPrefix("platform_workflows_enterprise_updated_idx")).on(table.enterpriseId, table.updatedAt),
  }),
)

export const platformWorkflowNodes = pgTable(
  withPrefix("platform_workflow_nodes"),
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "cascade" }),
    nodeKey: varchar("node_key", { length: 120 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    positionX: integer("position_x").default(0).notNull(),
    positionY: integer("position_y").default(0).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    nodeVersion: integer("node_version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowNodeKeyUnique: uniqueIndex(withPrefix("platform_workflow_nodes_workflow_node_key_idx")).on(
      table.workflowId,
      table.nodeKey,
    ),
    workflowPositionIdx: index(withPrefix("platform_workflow_nodes_workflow_position_idx")).on(
      table.workflowId,
      table.positionX,
      table.positionY,
    ),
  }),
)

export const platformWorkflowEdges = pgTable(
  withPrefix("platform_workflow_edges"),
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "cascade" }),
    sourceNodeKey: varchar("source_node_key", { length: 120 }).notNull(),
    targetNodeKey: varchar("target_node_key", { length: 120 }).notNull(),
    inputName: varchar("input_name", { length: 80 }),
    edgeKey: varchar("edge_key", { length: 180 }),
    sourcePortId: varchar("source_port_id", { length: 120 }),
    targetPortId: varchar("target_port_id", { length: 120 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowTargetIdx: index(withPrefix("platform_workflow_edges_workflow_target_idx")).on(
      table.workflowId,
      table.targetNodeKey,
      table.sourceNodeKey,
    ),
    workflowSourceIdx: index(withPrefix("platform_workflow_edges_workflow_source_idx")).on(
      table.workflowId,
      table.sourceNodeKey,
    ),
  }),
)

/** Immutable v2 workflow snapshots.  Normalized node/edge rows remain the
 * query projection; this table is the audit/run contract and is append-only. */
export const platformWorkflowRevisions = pgTable(
  withPrefix("platform_workflow_revisions"),
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    definitionHash: varchar("definition_hash", { length: 64 }).notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowRevisionUnique: uniqueIndex(withPrefix("platform_workflow_revisions_workflow_revision_idx")).on(
      table.workflowId,
      table.revision,
    ),
    workflowCreatedIdx: index(withPrefix("platform_workflow_revisions_workflow_created_idx")).on(
      table.workflowId,
      table.createdAt,
    ),
  }),
)

/** Immutable run-time definition snapshot captured at run creation time. */
export const platformWorkflowRunSnapshots = pgTable(
  withPrefix("platform_workflow_run_snapshots"),
  {
    taskRunId: integer("task_run_id")
      .primaryKey()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "restrict" }),
    revisionId: integer("revision_id")
      .notNull()
      .references(() => platformWorkflowRevisions.id, { onDelete: "restrict" }),
    definitionHash: varchar("definition_hash", { length: 64 }).notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowRequestUnique: uniqueIndex(withPrefix("platform_workflow_run_snapshots_workflow_request_idx")).on(
      table.workflowId,
      table.requestId,
    ),
    revisionIdx: index(withPrefix("platform_workflow_run_snapshots_revision_idx")).on(table.revisionId),
  }),
)

export const platformWorkflowIterations = pgTable(
  withPrefix("platform_workflow_iterations"),
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    scopeNodeKey: varchar("scope_node_key", { length: 120 }).notNull(),
    iterationKey: varchar("iteration_key", { length: 160 }).notNull(),
    iterationIndex: integer("iteration_index").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown> | null>(),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown> | null>(),
    creditsReserved: integer("credits_reserved").default(0).notNull(),
    creditsConsumed: integer("credits_consumed").default(0).notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusCheck: check(
      withPrefix("platform_workflow_iterations_status_check"),
      sql` ${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    runScopeKeyUnique: uniqueIndex(withPrefix("platform_workflow_iterations_run_scope_key_idx")).on(
      table.runId,
      table.scopeNodeKey,
      table.iterationKey,
    ),
    runScopeIndexUnique: uniqueIndex(withPrefix("platform_workflow_iterations_run_scope_index_idx")).on(
      table.runId,
      table.scopeNodeKey,
      table.iterationIndex,
    ),
    runStatusIdx: index(withPrefix("platform_workflow_iterations_run_status_idx")).on(table.runId, table.status),
  }),
)

export const enterprisePlatformCustomAgents = pgTable(
  withPrefix("enterprise_platform_custom_agents"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceAgentId: varchar("source_agent_id", { length: 128 }),
    linkedWorkflowId: integer("linked_workflow_id").references(() => platformWorkflows.id, { onDelete: "set null" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    category: varchar("category", { length: 24 }).default("custom").notNull(),
    summary: text("summary").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    systemPromptSummary: text("system_prompt_summary"),
    goal: text("goal"),
    scope: text("scope"),
    guardrails: text("guardrails"),
    defaultOutputType: varchar("default_output_type", { length: 32 }).default("text").notNull(),
    runtimeModelOptions: jsonb("runtime_model_options").$type<Record<string, unknown> | null>(),
    knowledgeBindings: jsonb("knowledge_bindings").$type<number[] | null>(),
    knowledgeRetrievalPolicy: jsonb("knowledge_retrieval_policy").$type<Record<string, unknown> | null>(),
    toolBindings: jsonb("tool_bindings").$type<Record<string, unknown> | null>(),
    skillBindings: jsonb("skill_bindings").$type<Record<string, unknown> | null>(),
    mcpBindings: jsonb("mcp_bindings").$type<Record<string, unknown> | null>(),
    artifactKinds: jsonb("artifact_kinds").$type<string[] | null>(),
    visibility: varchar("visibility", { length: 16 }).default("private").notNull(),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("enterprise_platform_custom_agents_enterprise_slug_idx")).on(
      table.enterpriseId,
      table.slug,
    ),
    enterpriseOwnerStatusIdx: index(withPrefix("enterprise_platform_custom_agents_enterprise_owner_status_idx")).on(
      table.enterpriseId,
      table.ownerUserId,
      table.status,
    ),
    enterpriseUpdatedIdx: index(withPrefix("enterprise_platform_custom_agents_enterprise_updated_idx")).on(
      table.enterpriseId,
      table.updatedAt,
    ),
    linkedWorkflowIdx: index(withPrefix("enterprise_platform_custom_agents_linked_workflow_idx")).on(table.linkedWorkflowId),
  }),
)

export const enterprisePlatformCustomAgentBusinessBindings = pgTable(
  withPrefix("enterprise_platform_custom_agent_business_bindings"),
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => enterprisePlatformCustomAgents.id, { onDelete: "cascade" }),
    businessSlug: varchar("business_slug", { length: 64 }).notNull(),
    displayPriority: integer("display_priority").default(100).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    agentBusinessUnique: uniqueIndex(withPrefix("enterprise_platform_custom_agent_business_bindings_agent_business_idx")).on(
      table.agentId,
      table.businessSlug,
    ),
    businessEnabledIdx: index(withPrefix("enterprise_platform_custom_agent_business_bindings_business_enabled_idx")).on(
      table.businessSlug,
      table.enabled,
    ),
  }),
)

export const enterprisePlatformCustomAgentWorkflowBindings = pgTable(
  withPrefix("enterprise_platform_custom_agent_workflow_bindings"),
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => enterprisePlatformCustomAgents.id, { onDelete: "cascade" }),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "cascade" }),
    nodeRole: varchar("node_role", { length: 64 }).default("agent").notNull(),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown> | null>(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown> | null>(),
    knowledgeSourceIds: jsonb("knowledge_source_ids").$type<number[] | null>(),
    retrievalMode: varchar("retrieval_mode", { length: 24 }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    agentWorkflowUnique: uniqueIndex(withPrefix("enterprise_platform_custom_agent_workflow_bindings_agent_workflow_idx")).on(
      table.agentId,
      table.workflowId,
    ),
    workflowEnabledIdx: index(withPrefix("enterprise_platform_custom_agent_workflow_bindings_workflow_enabled_idx")).on(
      table.workflowId,
      table.enabled,
    ),
  }),
)

export const enterprisePlatformPluginSlots = pgTable(
  withPrefix("enterprise_platform_plugin_slots"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    slug: varchar("slug", { length: 128 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull(),
    integratesWith: varchar("integrates_with", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).default("beta").notNull(),
    publicVisible: boolean("public_visible").default(false).notNull(),
    workspaceVisible: boolean("workspace_visible").default(true).notNull(),
    bindingTarget: varchar("binding_target", { length: 128 }),
    bindingMode: varchar("binding_mode", { length: 32 }).default("existing_runtime").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("enterprise_platform_plugin_slots_enterprise_slug_idx")).on(
      table.enterpriseId,
      table.slug,
    ),
  }),
)

export const enterprisePlatformMcpServiceProfiles = pgTable(
  withPrefix("enterprise_platform_mcp_service_profiles"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    slug: varchar("slug", { length: 128 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull(),
    serviceType: varchar("service_type", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).default("beta").notNull(),
    publicVisible: boolean("public_visible").default(false).notNull(),
    workspaceVisible: boolean("workspace_visible").default(true).notNull(),
    bindingTarget: varchar("binding_target", { length: 128 }),
    bindingMode: varchar("binding_mode", { length: 32 }).default("existing_runtime").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    enterpriseSlugUnique: uniqueIndex(withPrefix("enterprise_platform_mcp_service_profiles_enterprise_slug_idx")).on(
      table.enterpriseId,
      table.slug,
    ),
  }),
)

export const platformTaskRuns = pgTable(
  withPrefix("platform_task_runs"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    kind: varchar("kind", { length: 24 }).notNull(),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    itemSlug: varchar("item_slug", { length: 128 }).notNull(),
    externalRunId: varchar("external_run_id", { length: 255 }),
    externalSystem: varchar("external_system", { length: 32 }),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown> | null>(),
    normalizedResult: jsonb("normalized_result").$type<Record<string, unknown> | null>(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseCreatedIdx: index(withPrefix("platform_task_runs_enterprise_created_idx")).on(
      table.enterpriseId,
      table.createdAt,
    ),
    enterpriseStatusIdx: index(withPrefix("platform_task_runs_enterprise_status_idx")).on(
      table.enterpriseId,
      table.status,
    ),
  }),
)

export const platformOpenCodeRuntimeRuns = pgTable(
  withPrefix("platform_opencode_runtime_runs"),
  {
    id: serial("id").primaryKey(),
    taskRunId: integer("task_run_id")
      .notNull()
      .unique()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    runtimeRunId: uuid("runtime_run_id").notNull().unique(),
    sessionKey: varchar("session_key", { length: 64 }).notNull(),
    conversationId: varchar("conversation_id", { length: 128 }),
    agentId: varchar("agent_id", { length: 128 }),
    functionId: varchar("function_id", { length: 64 }),
    backend: varchar("backend", { length: 40 }).default("cloudflare-opencode-session").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    dispatchKey: text("dispatch_key"),
    workflowInstanceId: varchar("workflow_instance_id", { length: 128 }),
    opencodeSessionId: varchar("opencode_session_id", { length: 128 }),
    sandboxId: varchar("sandbox_id", { length: 128 }),
    workspaceBackup: jsonb("workspace_backup").$type<Record<string, unknown> | null>(),
    attempt: integer("attempt").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    leaseOwner: varchar("lease_owner", { length: 128 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    billingPayload: jsonb("billing_payload").$type<Record<string, unknown> | null>(),
    lastErrorCode: varchar("last_error_code", { length: 128 }),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    sessionStatusIdx: index(withPrefix("platform_opencode_runtime_session_status_idx")).on(table.sessionKey, table.status),
    leaseIdx: index(withPrefix("platform_opencode_runtime_lease_idx")).on(table.status, table.leaseExpiresAt),
  }),
)

export const platformOpenCodeRuntimeCheckpoints = pgTable(
  withPrefix("platform_opencode_runtime_checkpoints"),
  {
    id: serial("id").primaryKey(),
    runtimeRunId: uuid("runtime_run_id")
      .notNull()
      .references(() => platformOpenCodeRuntimeRuns.runtimeRunId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stage: varchar("stage", { length: 128 }).notNull(),
    backupHandle: jsonb("backup_handle").$type<Record<string, unknown> | null>(),
    resumePayload: jsonb("resume_payload").$type<Record<string, unknown>>().default({}).notNull(),
    artifactIds: jsonb("artifact_ids").$type<number[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    runSequenceUnique: uniqueIndex(withPrefix("platform_opencode_runtime_checkpoints_run_sequence_idx")).on(
      table.runtimeRunId,
      table.sequence,
    ),
    runCreatedIdx: index(withPrefix("platform_opencode_runtime_checkpoints_run_created_idx")).on(
      table.runtimeRunId,
      table.createdAt,
    ),
  }),
)

export const platformTaskRunEvents = pgTable(
  withPrefix("platform_task_run_events"),
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 16 }).notNull(),
    message: varchar("message", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runCreatedIdx: index(withPrefix("platform_task_run_events_run_created_idx")).on(table.runId, table.createdAt),
  }),
)

export const platformArtifacts = pgTable(
  withPrefix("platform_artifacts"),
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    kind: varchar("kind", { length: 24 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }),
    storageKey: text("storage_key"),
    externalUrl: text("external_url"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseCreatedIdx: index(withPrefix("platform_artifacts_enterprise_created_idx")).on(
      table.enterpriseId,
      table.createdAt,
    ),
    runCreatedIdx: index(withPrefix("platform_artifacts_run_created_idx")).on(table.runId, table.createdAt),
  }),
)

export const businessWorkbenchStates = pgTable(
  withPrefix("business_workbench_states"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currentViewSlug: varchar("current_view_slug", { length: 64 }).notNull().default("content-growth"),
    activeTabId: varchar("active_tab_id", { length: 160 }),
    tabs: jsonb("tabs").$type<Record<string, unknown>[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex(withPrefix("business_workbench_states_user_idx")).on(table.userId),
    userUpdatedIdx: index(withPrefix("business_workbench_states_user_updated_idx")).on(table.userId, table.updatedAt),
  }),
)

export const businessMarketplaceSelections = pgTable(
  withPrefix("business_marketplace_selections"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    selectedAgentIds: jsonb("selected_agent_ids").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex(withPrefix("business_marketplace_selections_user_idx")).on(table.userId),
    userUpdatedIdx: index(withPrefix("business_marketplace_selections_user_updated_idx")).on(
      table.userId,
      table.updatedAt,
    ),
  }),
)

export const platformWorkItems = pgTable(
  withPrefix("platform_work_items"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    sourceArtifactId: integer("source_artifact_id")
      .notNull()
      .references(() => platformArtifacts.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    enterpriseCreatedIdx: index(withPrefix("platform_work_items_enterprise_created_idx")).on(
      table.enterpriseId,
      table.createdAt,
    ),
    sourceArtifactIdx: index(withPrefix("platform_work_items_source_artifact_idx")).on(table.sourceArtifactId),
  }),
)

export const platformWorkflowNodeExecutions = pgTable(
  withPrefix("platform_workflow_node_executions"),
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => platformTaskRuns.id, { onDelete: "cascade" }),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => platformWorkflows.id, { onDelete: "cascade" }),
    nodeKey: varchar("node_key", { length: 120 }).notNull(),
    nodeType: varchar("node_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    providerId: varchar("provider_id", { length: 80 }),
    modelId: varchar("model_id", { length: 160 }),
    taskRunId: integer("task_run_id").references(() => platformTaskRuns.id, { onDelete: "set null" }),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown> | null>(),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown> | null>(),
    errorMessage: text("error_message"),
    creditsConsumed: integer("credits_consumed").default(0).notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    runNodeKeyUnique: uniqueIndex(withPrefix("platform_workflow_node_executions_run_node_key_idx")).on(
      table.runId,
      table.nodeKey,
    ),
    workflowStatusIdx: index(withPrefix("platform_workflow_node_executions_workflow_status_idx")).on(
      table.workflowId,
      table.status,
      table.createdAt,
    ),
    taskRunIdx: index(withPrefix("platform_workflow_node_executions_task_run_idx")).on(table.taskRunId),
  }),
)

export const platformWorkflowNodeAttempts = pgTable(
  withPrefix("platform_workflow_node_attempts"),
  {
    id: serial("id").primaryKey(),
    nodeExecutionId: integer("node_execution_id")
      .notNull()
      .references(() => platformWorkflowNodeExecutions.id, { onDelete: "cascade" }),
    iterationId: integer("iteration_id").references(() => platformWorkflowIterations.id, { onDelete: "cascade" }),
    scopeKey: varchar("scope_key", { length: 160 }).notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 80 }),
    modelId: varchar("model_id", { length: 160 }),
    providerRequestId: varchar("provider_request_id", { length: 255 }),
    providerTaskId: varchar("provider_task_id", { length: 255 }),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown> | null>(),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown> | null>(),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    creditsReserved: integer("credits_reserved").default(0).notNull(),
    creditsConsumed: integer("credits_consumed").default(0).notNull(),
    submittedAt: timestamp("submitted_at"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusCheck: check(
      withPrefix("platform_workflow_node_attempts_status_check"),
      sql` ${table.status} IN ('queued', 'submitting', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled')`,
    ),
    nodeScopeAttemptUnique: uniqueIndex(withPrefix("platform_workflow_node_attempts_node_scope_number_idx")).on(
      table.nodeExecutionId,
      table.scopeKey,
      table.attemptNumber,
    ),
    idempotencyUnique: uniqueIndex(withPrefix("platform_workflow_node_attempts_idempotency_idx")).on(table.idempotencyKey),
    providerTaskIdx: index(withPrefix("platform_workflow_node_attempts_provider_task_idx")).on(table.providerTaskId),
    nodeCreatedIdx: index(withPrefix("platform_workflow_node_attempts_node_created_idx")).on(
      table.nodeExecutionId,
      table.createdAt,
    ),
  }),
)

export const platformKnowledgeSaveJobs = pgTable(
  withPrefix("platform_knowledge_save_jobs"),
  {
    id: serial("id").primaryKey(),
    artifactId: integer("artifact_id")
      .notNull()
      .references(() => platformArtifacts.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    targetType: varchar("target_type", { length: 32 }).default("knowledge_base").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown> | null>(),
    resultPayload: jsonb("result_payload").$type<Record<string, unknown> | null>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    artifactCreatedIdx: index(withPrefix("platform_knowledge_save_jobs_artifact_created_idx")).on(
      table.artifactId,
      table.createdAt,
    ),
    enterpriseStatusIdx: index(withPrefix("platform_knowledge_save_jobs_enterprise_status_idx")).on(
      table.enterpriseId,
      table.status,
    ),
  }),
)

// Submitted URLs table for industry knowledge base
export const submittedUrls = pgTable(withPrefix("submitted_urls"), {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, processing, completed, failed
  submittedBy: integer("submitted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
})

// Templates table for content generation workflows
export const templates = pgTable(withPrefix("templates"), {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tags: text("tags"), // JSON array of tags
  category: varchar("category", { length: 100 }).notNull(), // 'social_media', 'email', 'article', 'ecommerce'
  industryKnowledgeBaseId: integer("industry_knowledge_base_id").references(() => industryKnowledgeBases.id),

  // Workflow configuration
  workflowUrl: text("workflow_url").notNull(), // n8n webhook URL or Dify API endpoint
  workflowId: varchar("workflow_id", { length: 255 }).notNull(), // workflow identifier
  workflowApiKey: varchar("workflow_api_key", { length: 500 }), // encrypted API key
  workflowType: varchar("workflow_type", { length: 20 }).notNull(), // 'n8n' or 'dify'

  // Template type and ownership
  templateType: varchar("template_type", { length: 20 }).notNull(), // 'public' or 'custom'
  customUserId: integer("custom_user_id").references(() => users.id), // null for public templates

  // Template configuration
  inputFields: text("input_fields"), // JSON string of required input fields
  outputFormat: varchar("output_format", { length: 50 }).default("text"), // 'text', 'html', 'markdown'

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Industry knowledge bases table for Milvus collections
export const industryKnowledgeBases = pgTable(withPrefix("industry_knowledge_bases"), {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 255 }), // URL or source description
  milvusCollectionName: varchar("milvus_collection_name", { length: 255 }).notNull().unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
})

// Personal knowledge bases table for user-specific Milvus collections
export const personalKnowledgeBases = pgTable(withPrefix("personal_knowledge_bases"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 255 }), // File upload or source description
  milvusCollectionName: varchar("milvus_collection_name", { length: 255 }).notNull().unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const userKnowledgeDatasets = pgTable(
  withPrefix("user_knowledge_datasets"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 32 }).default("general").notNull(),
    description: text("description"),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userNameUnique: uniqueIndex(withPrefix("user_knowledge_datasets_user_name_idx")).on(table.userId, table.name),
    userUpdatedIdx: index(withPrefix("user_knowledge_datasets_user_updated_idx")).on(table.userId, table.updatedAt),
  }),
)

export const userKnowledgeDocuments = pgTable(
  withPrefix("user_knowledge_documents"),
  {
    id: serial("id").primaryKey(),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => userKnowledgeDatasets.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    sourceType: varchar("source_type", { length: 24 }).default("manual").notNull(),
    sourceUrl: text("source_url"),
    status: varchar("status", { length: 24 }).default("ready").notNull(),
    chunkCount: integer("chunk_count").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    datasetUpdatedIdx: index(withPrefix("user_knowledge_documents_dataset_updated_idx")).on(table.datasetId, table.updatedAt),
    userStatusIdx: index(withPrefix("user_knowledge_documents_user_status_idx")).on(table.userId, table.status),
  }),
)

// Template usage tracking
export const templateUsage = pgTable(withPrefix("template_usage"), {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  inputData: text("input_data"), // JSON string of input parameters
  outputData: text("output_data"), // Generated content
  status: varchar("status", { length: 20 }).default("pending"), // pending, success, failed
  executionTime: integer("execution_time"), // milliseconds
  createdAt: timestamp("created_at").defaultNow(),
})

// n8n 连接配置（支持用户自定义 n8n 实例/域名）
export const n8nConnections = pgTable(withPrefix("n8n_connections"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: varchar("api_key", { length: 500 }), // 可加密存储
  webhookSecret: varchar("webhook_secret", { length: 500 }),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// 通用任务执行表（统一跟踪 n8n 执行与结果）
export const tasks = pgTable(withPrefix("tasks"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  connectionId: integer("connection_id").references(() => n8nConnections.id),
  workflowName: varchar("workflow_name", { length: 255 }),
  webhookPath: varchar("webhook_path", { length: 255 }),
  executionId: varchar("execution_id", { length: 255 }),
  payload: text("payload"),
  result: text("result"),
  status: varchar("status", { length: 30 }).default("pending"), // pending, running, approved, rejected, success, failed
  workerId: varchar("worker_id", { length: 80 }),
  attempts: integer("attempts").default(0).notNull(),
  startedAt: timestamp("started_at"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  relatedStorageKey: text("related_storage_key"), // 可用于文件处理等
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Dify 连接配置（支持不同域名/私有 Dify）
export const difyConnections = pgTable(withPrefix("dify_connections"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: varchar("api_key", { length: 500 }), // API密钥
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
