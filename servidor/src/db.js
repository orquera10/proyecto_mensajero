import pg from 'pg'
import sqlite3 from 'sqlite3'
import bcrypt from 'bcryptjs'
import { config } from './config.js'

const { Pool } = pg

export let dbType = 'sqlite'
let pgPool = null
let sqliteDb = null

// Normaliza nombres de sectores a Title Case (Primer letra en mayúscula de cada palabra)
export function formatSectorName(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s\-\/\(\).])[a-záéíóúñü]/gi, (letter) => letter.toUpperCase())
    .replace(/\s+/g, ' ')
}

// Initialize Database connection
export async function initDb() {
  const isPostgres = Boolean(config.db.url || config.db.host)

  if (isPostgres) {
    dbType = 'postgres'
    console.log('🐘 Conectando a PostgreSQL...')

    const poolConfig = config.db.url
      ? { connectionString: config.db.url, ...(config.db.ssl ? { ssl: config.db.ssl } : {}) }
      : {
          host: config.db.host,
          port: config.db.port,
          user: config.db.user,
          password: config.db.password,
          database: config.db.database,
          ...(config.db.ssl ? { ssl: config.db.ssl } : {})
        }

    if (config.db.url) {
      console.log('🔗 Conexión configurada mediante DATABASE_URL')
    } else {
      console.log(`🔗 Conexión configurada a PostgreSQL en ${config.db.host}:${config.db.port}/${config.db.database} (usuario: ${config.db.user})`)
    }

    pgPool = new Pool(poolConfig)

    // Test connection
    const client = await pgPool.connect()
    console.log('✅ Conexión con PostgreSQL establecida correctamente.')
    client.release()
  } else {
    dbType = 'sqlite'
    console.log(`📁 Modo Local: Usando SQLite en ${config.db.sqliteFile}`)

    sqliteDb = new sqlite3.Database(config.db.sqliteFile)
  }

  // Run migrations and seeds
  await runMigrations()
  await seedInitialData()
}

// Universal Query Helper
export async function query(sql, params = []) {
  if (dbType === 'postgres') {
    let pgSql = sql
    if (/^\s*INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id'
    }
    // Adapt ? placeholders to $1, $2, ... for PostgreSQL
    let paramIndex = 1
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`)
    const res = await pgPool.query(pgSql, params)
    return {
      rows: res.rows,
      rowCount: res.rowCount,
      insertId: res.rows[0]?.id,
    }
  } else {
    // SQLite Execution
    return new Promise((resolve, reject) => {
      const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sql)
      if (isSelect) {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) return reject(err)
          resolve({ rows: rows || [], rowCount: rows ? rows.length : 0 })
        })
      } else {
        sqliteDb.run(sql, params, function (err) {
          if (err) return reject(err)
          resolve({
            rows: [],
            rowCount: this.changes,
            insertId: this.lastID,
          })
        })
      }
    })
  }
}

// Auto-migration schema
async function runMigrations() {
  console.log('🔄 Verificando tablas en base de datos...')

  if (dbType === 'postgres') {
    await query(`
      CREATE TABLE IF NOT EXISTS sectors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        parent_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
        description TEXT,
        color VARCHAR(20) DEFAULT '#3b82f6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
        is_leader BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'user',
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
        content TEXT,
        message_type VARCHAR(20) DEFAULT 'text',
        file_url TEXT,
        file_name VARCHAR(255),
        file_size BIGINT,
        file_mime VARCHAR(100),
        status VARCHAR(20) DEFAULT 'sent',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS broadcast_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        last_read_id INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // PostgreSQL schema patches
    try {
      await query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE;`)
      await query(`ALTER TABLE sectors DROP CONSTRAINT IF EXISTS sectors_name_key;`)
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_leader BOOLEAN DEFAULT FALSE;`)
      await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';`)
      await query(`ALTER TABLE broadcast_reads ADD COLUMN IF NOT EXISTS id SERIAL;`)
    } catch (e) {
      console.warn('PostgreSQL migration warning:', e.message)
    }
  } else {
    // SQLite Schema
    await query(`
      CREATE TABLE IF NOT EXISTS sectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER DEFAULT NULL,
        description TEXT,
        color TEXT DEFAULT '#3b82f6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES sectors(id) ON DELETE CASCADE
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        sector_id INTEGER,
        is_leader INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER,
        sector_id INTEGER,
        content TEXT,
        message_type TEXT DEFAULT 'text',
        file_url TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_mime TEXT,
        status TEXT DEFAULT 'sent',
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
      );
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS broadcast_reads (
        user_id INTEGER PRIMARY KEY,
        last_read_id INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)

    // SQLite schema patches for existing databases
    try {
      const { rows: sectorCols } = await query(`PRAGMA table_info(sectors)`)
      if (!sectorCols.some((c) => c.name === 'parent_id')) {
        await query(`ALTER TABLE sectors ADD COLUMN parent_id INTEGER DEFAULT NULL`)
      }

      const { rows: userCols } = await query(`PRAGMA table_info(users)`)
      if (!userCols.some((c) => c.name === 'is_leader')) {
        await query(`ALTER TABLE users ADD COLUMN is_leader INTEGER DEFAULT 0`)
      }

      const { rows: messageCols } = await query(`PRAGMA table_info(messages)`)
      if (!messageCols.some((c) => c.name === 'status')) {
        await query(`ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'sent'`)
        await query(`UPDATE messages SET status = CASE WHEN is_read = 1 THEN 'read' ELSE 'delivered' END`)
      }
    } catch (e) {
      console.warn('SQLite migration warning:', e.message)
    }
  }

  // Sanitización automática de codificación UTF-8 en nombres de usuarios
  try {
    // 1. Caso reportado: Alexander Magaña
    await query(`
      UPDATE users 
      SET display_name = 'Alexander Magaña' 
      WHERE (LOWER(username) LIKE '%maga%' OR LOWER(display_name) LIKE '%maga%')
        AND display_name != 'Alexander Magaña'
    `)

    // 2. Reparar caracteres de reemplazo Unicode (\uFFFD o ) en cualquier usuario
    const { rows: corruptedUsers } = await query(`
      SELECT id, display_name FROM users 
      WHERE display_name LIKE '%\uFFFD%' OR display_name LIKE '%%'
    `)
    for (const u of corruptedUsers) {
      const fixedName = u.display_name.replace(/[\uFFFD]/g, 'ñ')
      await query(`UPDATE users SET display_name = ? WHERE id = ?`, [fixedName, u.id])
      console.log(`🔧 Corregido nombre de usuario #${u.id}: "${u.display_name}" -> "${fixedName}"`)
    }

    // 3. Normalizar nombres de sectores existentes a Title Case (Primer letra en mayúscula de cada palabra)
    const { rows: allSectors } = await query(`SELECT id, name FROM sectors`)
    for (const sec of allSectors) {
      const normalized = formatSectorName(sec.name)
      if (normalized && normalized !== sec.name) {
        await query(`UPDATE sectors SET name = ? WHERE id = ?`, [normalized, sec.id])
        console.log(`🔧 Normalizado nombre de sector #${sec.id}: "${sec.name}" -> "${normalized}"`)
      }
    }

    // 4. Reparar y desglosar sectores con rutas compuestas heredadas (ej: "A > B > C")
    await repairCompoundSectors()
  } catch (cleanErr) {
    console.warn('Advertencia al sanitizar base de datos:', cleanErr.message)
  }

  console.log('✅ Estructura de base de datos lista.')
}

// Desglosa sectores guardados con nombres de ruta completa en árboles de sectores y subsectores reales
export async function repairCompoundSectors() {
  try {
    const { rows: compound } = await query(`SELECT * FROM sectors WHERE name LIKE ?`, ['%>%'])
    if (!compound || compound.length === 0) return

    console.log(`🔍 Encontrados ${compound.length} sector(es) con ruta compuesta. Desglosando en jerarquía real...`)

    for (const comp of compound) {
      const parts = comp.name.split(/\s*(?:>|\/)\s*/).filter(Boolean)
      if (parts.length <= 1) continue

      let currentParentId = null

      // Crear o ubicar los padres intermedios
      for (let i = 0; i < parts.length - 1; i++) {
        const segName = formatSectorName(parts[i])
        const { rows: siblings } = await query(
          currentParentId === null
            ? `SELECT id, name FROM sectors WHERE parent_id IS NULL`
            : `SELECT id, name FROM sectors WHERE parent_id = ?`,
          currentParentId === null ? [] : [currentParentId]
        )

        let parentSector = siblings.find(
          (s) => s.name.trim().toLowerCase() === segName.toLowerCase() && !s.name.includes('>')
        )

        if (parentSector) {
          currentParentId = parentSector.id
        } else {
          const desc = currentParentId
            ? `Subsector institucional en ${parts.slice(0, i + 1).map(formatSectorName).join(' > ')}`
            : `Sector institucional principal`
          const { insertId } = await query(
            `INSERT INTO sectors (name, description, color, parent_id) VALUES (?, ?, ?, ?)`,
            [segName, desc, '#3b82f6', currentParentId]
          )
          currentParentId = insertId
          if (!currentParentId) {
            const { rows: created } = await query(
              currentParentId === null
                ? `SELECT id FROM sectors WHERE parent_id IS NULL AND name = ? LIMIT 1`
                : `SELECT id FROM sectors WHERE parent_id = ? AND name = ? LIMIT 1`,
              currentParentId === null ? [segName] : [currentParentId, segName]
            )
            currentParentId = created[0]?.id
          }
          console.log(`  ➕ Creado sector padre: "${segName}" (ID ${currentParentId})`)
        }
      }

      // Convertir el sector compuesto original en el subsector hoja
      const leafName = formatSectorName(parts[parts.length - 1])
      await query(
        `UPDATE sectors SET name = ?, parent_id = ?, description = ? WHERE id = ?`,
        [leafName, currentParentId, `Subsector institucional en ${parts.map(formatSectorName).join(' > ')}`, comp.id]
      )
      console.log(`  ✅ Sector compuesto #${comp.id} transformado en subsector hoja: "${leafName}" bajo padre ID ${currentParentId}`)
    }
  } catch (err) {
    console.warn('Advertencia al reparar sectores compuestos:', err.message)
  }
}

// Seed initial sectors and admin user if empty
async function seedInitialData() {
  const { rows: sectors } = await query('SELECT id FROM sectors LIMIT 1')

  if (sectors.length === 0) {
    console.log('🌱 Inicializando sectores predeterminados...')
    const defaultSectors = [
      ['Dirección General', 'Jefatura y Dirección institucional', '#8b5cf6'],
      ['Sistemas y TI', 'Soporte técnico e infraestructura', '#3b82f6'],
      ['Administración y Finanzas', 'Contabilidad y compras', '#10b981'],
      ['Recursos Humanos', 'Gestión de personal y talento', '#f59e0b'],
      ['Mesa de Entradas', 'Atención y recepción de expedientes', '#ec4899'],
    ]

    for (const [name, desc, color] of defaultSectors) {
      await query('INSERT INTO sectors (name, description, color) VALUES (?, ?, ?)', [name, desc, color])
    }
  }

  const { rows: users } = await query('SELECT id FROM users LIMIT 1')
  if (users.length === 0) {
    console.log('🌱 Creando usuario administrador inicial (admin / admin123)...')
    const { rows: firstSector } = await query('SELECT id FROM sectors WHERE name = ? LIMIT 1', ['Sistemas y TI'])
    const sectorId = firstSector[0]?.id || 1

    const passHash = await bcrypt.hash('admin123', 10)
    await query(
      `INSERT INTO users (username, password_hash, display_name, sector_id, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['admin', passHash, 'Administrador del Sistema', sectorId, 'admin']
    )

    // Also create 2 demo users for testing
    const demoPass = await bcrypt.hash('123456', 10)
    await query(
      `INSERT INTO users (username, password_hash, display_name, sector_id, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['jgonzalez', demoPass, 'Juan González', sectorId, 'user']
    )
    await query(
      `INSERT INTO users (username, password_hash, display_name, sector_id, role)
       VALUES (?, ?, ?, ?, ?)`,
      ['mrodriguez', demoPass, 'María Rodríguez', sectorId + 1, 'user']
    )
    console.log('✅ Usuarios iniciales creados: admin (admin123), jgonzalez (123456), mrodriguez (123456)')
  }
}
