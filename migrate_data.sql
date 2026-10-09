-- Script de migración de SQLite a PostgreSQL (Sectores y Usuarios)
-- Generado automáticamente: 2026-10-09T19:00:49.071Z

BEGIN;

-- 1. Limpiar tablas existentes en orden de dependencias
TRUNCATE messages, users, sectors RESTART IDENTITY CASCADE;

-- 2. Insertar Sectores (primero raíz, luego subsectores)
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (6, 'Secretaria de Niñez, Adolescencia y Familia', NULL, 'Sector raiz', '#0062ff', '2026-10-08 14:58:50');
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (2, 'Sistemas y TI', 6, 'Soporte técnico e infraestructura', '#77abfd', '2026-10-08 12:21:13');
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (4, 'Recursos Humanos', 6, 'Gestión de personal y talento', '#f59e0b', '2026-10-08 12:21:14');
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (5, 'Mesa de Entradas', 6, 'Atención y recepción de expedientes', '#ec4899', '2026-10-08 12:21:14');
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (7, 'Direccion de Niñez, Adolescencia y Familia', 6, '', '#9385ff', '2026-10-08 15:02:25');
INSERT INTO sectors (id, name, parent_id, description, color, created_at)
VALUES (8, 'Despacho', 7, '', '#89b5fb', '2026-10-08 15:02:50');
SELECT setval('sectors_id_seq', 9, false);

-- 3. Insertar Usuarios
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (1, 'admin', '$2b$10$.WszVYLk7hYtjVhgbCGpjOVkLA3Usn1xiZn4grQUZ5CyqeSxRx1R2', 'Administrador del Sistema', 2, FALSE, 'admin', NULL, '2026-10-08 12:21:14', '2026-10-08 12:21:14');
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (2, 'jgonzalez', '$2b$10$Ccvu1Z.SBZfYZJ.G0lUhAep22.m8EZl8YI1s9VcGsIKkQrRHrUYqu', 'Juan González', 2, FALSE, 'user', NULL, '2026-10-08 12:21:14', '2026-10-08 12:21:14');
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (3, 'mrodriguez', '$2b$10$Ccvu1Z.SBZfYZJ.G0lUhAep22.m8EZl8YI1s9VcGsIKkQrRHrUYqu', 'María Rodríguez', 4, TRUE, 'user', NULL, '2026-10-08 12:21:14', '2026-10-08 15:00:50');
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (4, 'dorquera', '$2b$10$VVyX4vxDfK3I8nRMu2EkXOVApnQWAcQmga9Y6600/Dfd.Yb0dLYJW', 'Dario Joaquin Orquera', 2, FALSE, 'admin', NULL, '2026-10-08 12:30:38', '2026-10-08 12:30:38');
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (5, 'rgomez', '$2b$10$Wg4rsdx8C4L7LLLhKkT4YutF5NHiqVLvXBfdmCd2lthdFgbnaiaYW', 'Rosario Gomez', 8, FALSE, 'user', NULL, '2026-10-08 15:03:50', '2026-10-08 15:03:50');
INSERT INTO users (id, username, password_hash, display_name, sector_id, is_leader, role, avatar_url, created_at, updated_at)
VALUES (6, 'darorquera', '$2b$10$liKMvzT/.E7NnMeoBKAG/uGrHwN4i5XWGkIJqhrYOYH2MnuBpJ1ca', 'Dario Orquera', 2, FALSE, 'user', NULL, '2026-10-08 16:31:28', '2026-10-08 16:31:28');
SELECT setval('users_id_seq', 7, false);

COMMIT;
