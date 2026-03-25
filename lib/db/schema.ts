import { pgTable, serial, integer, varchar, text, timestamp, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core"

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

export const leadHunterConversations = pgTable(withPrefix("lead_hunter_conversations"), {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
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

export const enterpriseDifyAdvisorConfigs = pgTable(
  withPrefix("enterprise_dify_advisor_configs"),
  {
    id: serial("id").primaryKey(),
    enterpriseId: integer("enterprise_id")
      .notNull()
      .references(() => enterprises.id),
    advisorType: varchar("advisor_type", { length: 32 }).notNull(),
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
