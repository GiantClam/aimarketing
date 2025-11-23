import { drizzle } from "drizzle-orm/neon-serverless"
import { neon } from "@neondatabase/serverless"

// Database connection configuration
// Neon requires a valid PostgreSQL connection string format: postgresql://user:password@host.tld/dbname?option=value
const getConnectionString = (): string => {
	const dbUrl = process.env.DATABASE_URL
	
	if (!dbUrl) {
		// During build time, provide a valid format placeholder
		// This allows the build to succeed even if DATABASE_URL is not set
		// At runtime, actual database operations will fail if DATABASE_URL is not configured
		return "postgresql://user:password@localhost:5432/aimarketing"
	}
	
	// Validate connection string format
	if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
		throw new Error(
			`DATABASE_URL must start with "postgresql://" or "postgres://". ` +
			`Received: ${dbUrl.substring(0, 50)}${dbUrl.length > 50 ? "..." : ""}`
		)
	}
	
	return dbUrl
}

const connectionString = getConnectionString()

// Create neon serverless client
// Note: During build, this will use the placeholder connection string
// At runtime, ensure DATABASE_URL is properly configured
const client = neon(connectionString)

// Create drizzle database instance
export const db = drizzle(client)
