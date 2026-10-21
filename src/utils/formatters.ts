/**
 * Normaliza nombres de sectores a formato Title Case (primer letra en mayúscula de cada palabra).
 * Ejemplos:
 * "MESA ENTRADA" -> "Mesa Entrada"
 * "SECRETARIA DE NIÑEZ" -> "Secretaria De Niñez"
 * "LINEA102" -> "Linea102"
 * "EQUIPO TECNICO" -> "Equipo Tecnico"
 */
export function formatSectorName(str?: string | null): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s\-\/\(\).])[a-záéíóúñü]/gi, (letter) => letter.toUpperCase())
    .replace(/\s+/g, ' ')
}
