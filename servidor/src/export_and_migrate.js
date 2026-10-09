import sqlite3 from 'sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const sqlitePath = path.resolve('data/database.sqlite')
const outputSqlPath = path.resolve('../migrate_data.sql')

console.log('📂 Leyendo base de datos SQLite local desde:', sqlitePath)

if (!fs.existsSync(sqlitePath)) {
  console.error('❌ No se encontró el archivo SQLite en:', sqlitePath)
  process.exit(1)
}

const db = new sqlite3.Database(sqlitePath)

function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows || [])
    })
  })
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return val
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  return `'${String(val).replace(/'/g, "''")}'`
}

async function run() {
  try {
    const sectors = await getAll('SELECT * FROM sectors ORDER BY id ASC')
    const users = await getAll('SELECT * FROM users ORDER BY id ASC')
    const messages = await getAll('SELECT * FROM messages ORDER BY id ASC')

    console.log(`📊 Datos a exportar:`)
    console.log(`   - Sectores: ${sectors.length}`)
    console.log(`   - Usuarios: ${users.length}`)

    // Generate SQL script
    let sql = `-- Script de migración de SQLite a PostgreSQL (Sectores y Usuarios)\n`
    sql += `-- Generado automáticamente: ${new Date().toISOString()}\n\n`
    sql += `BEGIN;\n\n`
    
    sql += `-- 1. Limpiar tablas existentes en orden de dependencias\n`
    sql += `TRUNCATE messages, users, sectors RESTART IDENTITY CASCADE;\n\n`

    sql += `-- 2. Insertar Sectores (primero raíz, luego subsectores)\n`
    // Insert sectors with parent_id NULL first, then children
    const rootSectors = sectors.filter(s => !s.parent_id)
    const childSectors = sectors.filter(s => s.parent_id)
    const orderedSectors = [...rootSectors, ...childSectors]

    for (const s of orderedSectors) {
      sql += `INSERT INTO sectors (id, name, parent_id, description, color, created_at)\n`
      sql += `VALUES (${s.id}, ${escapeSql(s.name)}, ${escapeSql(s.parent_id)}, ${escapeSql(s.description)}, ${escapeSql(s.color || '#3b82f6')}, ${escapeSql(s.created_at)});\n`
    }
    const maxSectorId = sectors.reduce((max, s) => Math.max(max, s.id), 0)
    sql += `SELECT setval('sectors_id_seq', ${maxSectorId + 1}, false);\n\n`

    sql += `-- 3. Insertar Usuarios\n`
    for (const u of users) {
      const isLeader = u.is_leader === 1 || u.is_leader === true ? 'TRUE' : 'FALSE'
      sql += `INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)\n`
      sql += `VALUES (${u.id}, ${escapeSql(u.username)}, ${escapeSql(u.password_hash)}, ${escapeSql(u.display_name)}, ${escapeSql(u.sector_id)}, ${isLeader}, ${escapeSql(u.role || 'user')}, ${escapeSql(u.avatar_url)}, ${escapeSql(u.created_at)}, ${escapeSql(u.updated_at)});\n`
    }
    const maxUserId = users.reduce((max, u) => Math.max(max, u.id), 0)
    sql += `SELECT setval('users_id_seq', ${maxUserId + 1}, false);\n\n`

    sql += `COMMIT;\n`

    fs.writeFileSync(outputSqlPath, sql, 'utf8')
    console.log(`\n💾 Archivo SQL generado exitosamente en: ${outputSqlPath}`)

    // If PostgreSQL credentials exist in environment, attempt direct migration
    const isPostgresConfigured = Boolean(process.env.DATABASE_URL || process.env.DB_HOST || process.env.POSTGRES_HOST)
    if (isPostgresConfigured) {
      console.log('\n🐘 Se detectó configuración de PostgreSQL en el entorno. Intentando migración directa...')
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.DB_HOST || process.env.POSTGRES_HOST,
        port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
        user: process.env.DB_USER || process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
        database: process.env.DB_NAME || process.env.POSTGRES_DB || process.env.DB_DATABASE,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      })

      const client = await pool.connect()
      console.log('✅ Conexión con PostgreSQL remota establecida. Ejecutando script...')
      await client.query(sql)
      console.log('🎉 ¡Migración directa a PostgreSQL completada con éxito!')
      client.release()
      await pool.end()
    } else {
      console.log('\n💡 Para aplicar el archivo SQL en producción podés ejecutarlo desde el cliente PostgreSQL o terminal de Coolify.')
    }

  } catch (err) {
    console.error('❌ Error durante la exportación / migración:', err)
  } finally {
    db.close()
  }
}

run()
