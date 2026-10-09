import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'

dotenv.config()

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data')
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads')

// Ensure data & upload directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'institucional_jwt_secret_super_seguro_2026',
  dataDir: DATA_DIR,
  uploadDir: UPLOAD_DIR,
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024, // 50MB default
  
  // Database Configuration
  db: {
    // If DATABASE_URL / POSTGRES_URL is set directly
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
    // Or separate parameters
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || process.env.PGHOST || '',
    port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10),
    user: process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER || '',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE || '',
    ssl:
      process.env.DB_SSL === 'true' || process.env.POSTGRES_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    sqliteFile: path.join(DATA_DIR, 'database.sqlite'),
  },
}
