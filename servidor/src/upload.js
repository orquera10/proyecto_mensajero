import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from './config.js'

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const randomName = crypto.randomBytes(16).toString('hex')
    cb(null, `${Date.now()}-${randomName}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize,
  },
})
