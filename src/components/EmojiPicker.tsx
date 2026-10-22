import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Smile,
  Sticker,
  Search,
  X,
  Send,
  Plus,
  Clock,
  Briefcase,
  ThumbsUp,
  Heart,
  Sparkles,
  Layers,
} from 'lucide-react'

export interface EmojiPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectEmoji: (emoji: string) => void
  onSendSticker?: (stickerText: string) => void
  onInsertSticker?: (stickerText: string) => void
}

interface EmojiItem {
  emoji: string
  name: string
  category: 'frecuentes' | 'caritas' | 'gestos' | 'oficina' | 'simbolos' | 'celebracion'
}

interface StickerItem {
  id: string
  icon: string
  title: string
  subtitle: string
  accentColor: string
  fullText: string
  category: 'respuestas' | 'tramites' | 'estado'
}

const EMOJI_DATABASE: EmojiItem[] = [
  // Frecuentes / Rápidos
  { emoji: '👍', name: 'pulgar arriba bien ok recibido me gusta si', category: 'frecuentes' },
  { emoji: '👏', name: 'aplausos bravo felicitaciones excelente genial', category: 'frecuentes' },
  { emoji: '✅', name: 'check aprobado correcto si hecho realizado', category: 'frecuentes' },
  { emoji: '🙏', name: 'gracias por favor oracion rezo agradecimiento', category: 'frecuentes' },
  { emoji: '👌', name: 'ok perfecto genial excelente de acuerdo', category: 'frecuentes' },
  { emoji: '😊', name: 'feliz sonrisa contento carita alegre', category: 'frecuentes' },
  { emoji: '😂', name: 'risa carcajada jajaja divertido gracia llorar de risa', category: 'frecuentes' },
  { emoji: '🤝', name: 'apretón de manos trato acuerdo coordinado juntos', category: 'frecuentes' },
  { emoji: '📋', name: 'portapapeles expediente tramite nota lista revision', category: 'frecuentes' },
  { emoji: '⏳', name: 'reloj de arena tiempo espera tramite paciencia', category: 'frecuentes' },
  { emoji: '🚨', name: 'alerta sirena urgente atencion peligro prioridad', category: 'frecuentes' },
  { emoji: '📁', name: 'carpeta expediente documentos archivo', category: 'frecuentes' },
  { emoji: '☕', name: 'cafe descanso pausa merienda mate', category: 'frecuentes' },
  { emoji: '❤️', name: 'corazon rojo amor cariño afecto', category: 'frecuentes' },
  { emoji: '🎯', name: 'objetivo diana meta cumplido acierto', category: 'frecuentes' },
  { emoji: '💡', name: 'foco idea bombilla propuesta ocurrencia', category: 'frecuentes' },

  // Caritas y Emoticonos
  { emoji: '😀', name: 'sonrisa feliz alegre contento', category: 'caritas' },
  { emoji: '😃', name: 'sonrisa grande abierto feliz alegre', category: 'caritas' },
  { emoji: '😄', name: 'ojos risa feliz carita contenta', category: 'caritas' },
  { emoji: '😁', name: 'dientes sonrisa amplia feliz', category: 'caritas' },
  { emoji: '😆', name: 'cerrando ojos risa carcajada', category: 'caritas' },
  { emoji: '😅', name: 'sudor alivio risa nerviosa', category: 'caritas' },
  { emoji: '🤣', name: 'rodando de risa muerto de risa jajaja', category: 'caritas' },
  { emoji: '🙂', name: 'sonrisa leve amable cordial', category: 'caritas' },
  { emoji: '🙃', name: 'carita al reves ironia juego', category: 'caritas' },
  { emoji: '😉', name: 'guiño complicidad de acuerdo', category: 'caritas' },
  { emoji: '😇', name: 'angel inocente bondad halo', category: 'caritas' },
  { emoji: '🥰', name: 'enamorado corazones tierno amor', category: 'caritas' },
  { emoji: '😍', name: 'ojos de corazon me encanta fascinado', category: 'caritas' },
  { emoji: '🤩', name: 'estrellas deslumbrado fascinado emocionado', category: 'caritas' },
  { emoji: '😘', name: 'beso saludo cariño despedida', category: 'caritas' },
  { emoji: '😋', name: 'lengua rico apetito sabroso', category: 'caritas' },
  { emoji: '😜', name: 'guiño lengua broma divertido', category: 'caritas' },
  { emoji: '🤪', name: 'locura loco divertido divertido', category: 'caritas' },
  { emoji: '🤗', name: 'abrazo calido abrazo saludo', category: 'caritas' },
  { emoji: '🤭', name: 'mano en boca risita sorpresa uups', category: 'caritas' },
  { emoji: '🤫', name: 'silencio secreto shh confidencial', category: 'caritas' },
  { emoji: '🤔', name: 'pensando duda reflexionar evaluar que tal', category: 'caritas' },
  { emoji: '🤐', name: 'boca cerrada cierre confidencial', category: 'caritas' },
  { emoji: '🤨', name: 'ceja levantada duda esceptico sospecha', category: 'caritas' },
  { emoji: '😐', name: 'neutral inexpresivo serio', category: 'caritas' },
  { emoji: '😑', name: 'sin comentarios serio cansado', category: 'caritas' },
  { emoji: '😶', name: 'sin boca sin palabras mudo', category: 'caritas' },
  { emoji: '😏', name: 'sonrisa socarrona picaro seguro', category: 'caritas' },
  { emoji: '😒', name: 'disgusto fastidio aburrido', category: 'caritas' },
  { emoji: '🙄', name: 'ojos en blanco fastidio otra vez', category: 'caritas' },
  { emoji: '😬', name: 'mueca incomodo apuro tension', category: 'caritas' },
  { emoji: '😌', name: 'alivio tranquilidad paz sereno', category: 'caritas' },
  { emoji: '😔', name: 'pensativo triste apenado bajon', category: 'caritas' },
  { emoji: '😴', name: 'durmiendo zzz cansado sueño', category: 'caritas' },
  { emoji: '😷', name: 'barbijo mascarilla enfermo resfrio salud', category: 'caritas' },
  { emoji: '🤒', name: 'termometro fiebre enfermo', category: 'caritas' },
  { emoji: '🤕', name: 'vendaje herido lastimado', category: 'caritas' },
  { emoji: '🥵', name: 'calor sofocado sudando', category: 'caritas' },
  { emoji: '🥶', name: 'frio helado congelado', category: 'caritas' },
  { emoji: '🤯', name: 'cabeza explotada asombrado increible wow', category: 'caritas' },
  { emoji: '🥳', name: 'fiesta celebracion festejo gorrito cumpleaños', category: 'caritas' },
  { emoji: '😎', name: 'lentes de sol canchero capo genial', category: 'caritas' },
  { emoji: '🤓', name: 'anteojos aplicado estudiante nerd', category: 'caritas' },
  { emoji: '🧐', name: 'monoculo investigando observando detalle', category: 'caritas' },
  { emoji: '😮', name: 'boca abierta sorpresa asombro', category: 'caritas' },
  { emoji: '😯', name: 'sorpresa atencion ufa', category: 'caritas' },
  { emoji: '😲', name: 'sorprendido impacto asombro', category: 'caritas' },
  { emoji: '😳', name: 'sonrojado verguenza impresionado', category: 'caritas' },
  { emoji: '🥺', name: 'ojos tiernos por favor suplica ternura', category: 'caritas' },
  { emoji: '😢', name: 'lagrima triste pena llanto', category: 'caritas' },
  { emoji: '😭', name: 'llorando lagrimas desespero triste', category: 'caritas' },
  { emoji: '😱', name: 'grito miedo susto espanto', category: 'caritas' },
  { emoji: '😤', name: 'resoplido enfado victoria orgullo', category: 'caritas' },
  { emoji: '😡', name: 'enojado furioso bronca molestia', category: 'caritas' },
  { emoji: '😠', name: 'molesto ceño fruncido enojo', category: 'caritas' },

  // Gestos y Personas
  { emoji: '👋', name: 'hola chau saludo mano despidiendo', category: 'gestos' },
  { emoji: '✋', name: 'alto mano parada stop espera', category: 'gestos' },
  { emoji: '🖐️', name: 'cinco mano extendida palma', category: 'gestos' },
  { emoji: '🖖', name: 'saludo prosperidad vulcaniano', category: 'gestos' },
  { emoji: '👌', name: 'perfecto de diez bien okay', category: 'gestos' },
  { emoji: '🤌', name: 'que decis gesto italiano que onda', category: 'gestos' },
  { emoji: '🤏', name: 'un poco poquito chico pizca', category: 'gestos' },
  { emoji: '✌️', name: 'paz victoria dos dedos', category: 'gestos' },
  { emoji: '🤞', name: 'dedos cruzados suerte ojala suerte', category: 'gestos' },
  { emoji: '🤟', name: 'te quiero te amo gesto rock', category: 'gestos' },
  { emoji: '🤘', name: 'rock cuernos metal fuerza', category: 'gestos' },
  { emoji: '🤙', name: 'llamame shaka tranqui telefono', category: 'gestos' },
  { emoji: '👈', name: 'izquierda senalar alla este', category: 'gestos' },
  { emoji: '👉', name: 'derecha senalar alla siguiente', category: 'gestos' },
  { emoji: '👆', name: 'arriba senalar este punto arriba', category: 'gestos' },
  { emoji: '👇', name: 'abajo senalar ver abajo link aqui', category: 'gestos' },
  { emoji: '☝️', name: 'atencion un momento primero', category: 'gestos' },
  { emoji: '👍', name: 'pulgar arriba me gusta ok bien de acuerdo', category: 'gestos' },
  { emoji: '👎', name: 'pulgar abajo no me gusta mal rechazo', category: 'gestos' },
  { emoji: '✊', name: 'puño cerrado fuerza resistencia', category: 'gestos' },
  { emoji: '👊', name: 'puño choque puños saludo', category: 'gestos' },
  { emoji: '🤛', name: 'puño izquierda choque', category: 'gestos' },
  { emoji: '🤜', name: 'puño derecha choque', category: 'gestos' },
  { emoji: '👏', name: 'aplauso aplausos felicidades felicitaciones', category: 'gestos' },
  { emoji: '🙌', name: 'manos arriba alabanza festejo celebracion', category: 'gestos' },
  { emoji: '👐', name: 'manos abiertas apertura', category: 'gestos' },
  { emoji: '🤲', name: 'palmas juntas recibir dar', category: 'gestos' },
  { emoji: '🤝', name: 'apreton manos acuerdo trato socios', category: 'gestos' },
  { emoji: '🙏', name: 'rezar orar gracias por favor agradecido', category: 'gestos' },
  { emoji: '✍️', name: 'escribiendo firma lapicera nota redactar', category: 'gestos' },
  { emoji: '💪', name: 'fuerza musculo animo adelante poder', category: 'gestos' },
  { emoji: '👀', name: 'ojos mirando atento espiando observando ojo', category: 'gestos' },
  { emoji: '👂', name: 'oreja escuchando atencion oir', category: 'gestos' },

  // Oficina, Trabajo y Documentos
  { emoji: '💼', name: 'maletin portafolio trabajo empleo oficina', category: 'oficina' },
  { emoji: '📁', name: 'carpeta expediente documentos archivo', category: 'oficina' },
  { emoji: '📂', name: 'carpeta abierta documentos expediente', category: 'oficina' },
  { emoji: '📄', name: 'pagina hoja documento folio hoja', category: 'oficina' },
  { emoji: '📃', name: 'documento enrollado certificado acta', category: 'oficina' },
  { emoji: '📋', name: 'portapapeles planilla notas lista tabla', category: 'oficina' },
  { emoji: '📊', name: 'grafico barras estadistica informe reporte', category: 'oficina' },
  { emoji: '📈', name: 'grafico crecimiento aumento subida rendimiento', category: 'oficina' },
  { emoji: '📉', name: 'grafico bajada descenso reduccion', category: 'oficina' },
  { emoji: '📅', name: 'calendario fecha dia mes agenda', category: 'oficina' },
  { emoji: '📆', name: 'almanaque fecha reunion cronograma', category: 'oficina' },
  { emoji: '📌', name: 'chincheta pin fijar aviso importante', category: 'oficina' },
  { emoji: '📍', name: 'chincheta roja ubicacion lugar punto fijado', category: 'oficina' },
  { emoji: '📎', name: 'clip adjunto archivo adjuntar', category: 'oficina' },
  { emoji: '🖇️', name: 'clips unidos adjuntos enlazados', category: 'oficina' },
  { emoji: '📏', name: 'regla medida medicion precision', category: 'oficina' },
  { emoji: '📐', name: 'escuadra geometria tecnico diseño', category: 'oficina' },
  { emoji: '✂️', name: 'tijeras cortar recorte tramite', category: 'oficina' },
  { emoji: '🔒', name: 'candado cerrado seguro clave protegido', category: 'oficina' },
  { emoji: '🔓', name: 'candado abierto desbloqueado disponible', category: 'oficina' },
  { emoji: '🔑', name: 'llave clave acceso contrasena permiso', category: 'oficina' },
  { emoji: '🔨', name: 'martillo justicia resolucion construccion', category: 'oficina' },
  { emoji: '⚖️', name: 'balanza justicia ley legal tribunal', category: 'oficina' },
  { emoji: '🏢', name: 'edificio oficina sede institucion ministerio', category: 'oficina' },
  { emoji: '🏛️', name: 'gobierno palacio edificio clasico estado tribunal', category: 'oficina' },
  { emoji: '💻', name: 'computadora notebook laptop sistema web', category: 'oficina' },
  { emoji: '🖥️', name: 'monitor escritorio pantalla pc gabinete', category: 'oficina' },
  { emoji: '🖨️', name: 'impresora imprimir impresion copia papel', category: 'oficina' },
  { emoji: '📱', name: 'celular telefono movil whatsapp llamada', category: 'oficina' },
  { emoji: '☎️', name: 'telefono fijo llamada interno central', category: 'oficina' },
  { emoji: '📧', name: 'correo email mensaje bandeja entrada', category: 'oficina' },
  { emoji: '📨', name: 'sobre entrante mensaje recibido', category: 'oficina' },
  { emoji: '📩', name: 'sobre enviando despacho salida', category: 'oficina' },
  { emoji: '📦', name: 'paquete encomienda caja envio recepcion', category: 'oficina' },
  { emoji: '🏷️', name: 'etiqueta rotulo clasificacion sector', category: 'oficina' },

  // Símbolos, Estados y Reacciones
  { emoji: '✅', name: 'check aprobado visto bueno correcto si listo', category: 'simbolos' },
  { emoji: '❌', name: 'cruz error cancelado denegado rechazo no', category: 'simbolos' },
  { emoji: '⚠️', name: 'advertencia precaucion cuidado alerta atencion', category: 'simbolos' },
  { emoji: '🚨', name: 'sirena emergencia urgente policia peligro', category: 'simbolos' },
  { emoji: '⛔', name: 'prohibido no pase acceso denegado stop', category: 'simbolos' },
  { emoji: '⏳', name: 'reloj de arena tiempo espera tramite', category: 'simbolos' },
  { emoji: '⌛', name: 'reloj terminado vencido plazo', category: 'simbolos' },
  { emoji: '⏰', name: 'despertador alarma horario hora puntual', category: 'simbolos' },
  { emoji: '⏱️', name: 'cronometro tiempo conteo veloz', category: 'simbolos' },
  { emoji: '🔔', name: 'campana notificacion aviso alerta recordatorio', category: 'simbolos' },
  { emoji: '🔕', name: 'campana tachada silencio no molestar mute', category: 'simbolos' },
  { emoji: '💡', name: 'foco bombilla idea propuesta vision', category: 'simbolos' },
  { emoji: '🔍', name: 'lupa buscar busqueda inspeccion analisis', category: 'simbolos' },
  { emoji: '🎯', name: 'diana objetivo meta precision tiro certero', category: 'simbolos' },
  { emoji: '🚀', name: 'cohete lanzamiento veloz rapido avance despegar', category: 'simbolos' },
  { emoji: '🔥', name: 'fuego caliente crack encendido furor', category: 'simbolos' },
  { emoji: '💯', name: 'cien puntos perfecto excelente diez impecable', category: 'simbolos' },
  { emoji: '📢', name: 'megafono aviso difusion comunicado anuncio', category: 'simbolos' },
  { emoji: '📣', name: 'altavoz anuncio mensaje publico', category: 'simbolos' },
  { emoji: '🛡️', name: 'escudo proteccion seguridad defensa guardia', category: 'simbolos' },
  { emoji: '🟢', name: 'circulo verde conectado disponible activo', category: 'simbolos' },
  { emoji: '🟡', name: 'circulo amarillo ausente espera pausa', category: 'simbolos' },
  { emoji: '🔴', name: 'circulo rojo ocupado desconectado no molestar', category: 'simbolos' },
  { emoji: '⭐', name: 'estrella destacado calificacion premio', category: 'simbolos' },
  { emoji: '🌟', name: 'estrella brillante destacada excelente', category: 'simbolos' },
  { emoji: '✨', name: 'destellos brillo impecable nuevo reluciente', category: 'simbolos' },

  // Celebración, Corazones & Social
  { emoji: '🎉', name: 'fiesta confeti festejo celebracion felicitaciones exito', category: 'celebracion' },
  { emoji: '🎊', name: 'bomba confeti celebracion fiesta', category: 'celebracion' },
  { emoji: '🎈', name: 'globo cumpleaños sorpresa festejo', category: 'celebracion' },
  { emoji: '🎁', name: 'regalo paquete presente sorpresa', category: 'celebracion' },
  { emoji: '🏆', name: 'trofeo copa ganador campeon primer puesto', category: 'celebracion' },
  { emoji: '🥇', name: 'medalla de oro primer lugar premio', category: 'celebracion' },
  { emoji: '🥈', name: 'medalla plata segundo lugar', category: 'celebracion' },
  { emoji: '🥉', name: 'medalla bronce tercer lugar', category: 'celebracion' },
  { emoji: '☕', name: 'cafe desayuno pausa descanso merienda', category: 'celebracion' },
  { emoji: '🍕', name: 'pizza comida almuerzo compartir', category: 'celebracion' },
  { emoji: '🍰', name: 'torta pastel cumpleaños dulce', category: 'celebracion' },
  { emoji: '❤️', name: 'corazon rojo amor cariño afecto', category: 'celebracion' },
  { emoji: '💙', name: 'corazon azul confianza institucional', category: 'celebracion' },
  { emoji: '💚', name: 'corazon verde esperanza salud bienestar', category: 'celebracion' },
  { emoji: '💛', name: 'corazon amarillo amistad luz', category: 'celebracion' },
  { emoji: '🤍', name: 'corazon blanco paz sinceridad', category: 'celebracion' },
]

const STICKERS_DATABASE: StickerItem[] = [
  // Respuestas Rápidas Institucionales
  {
    id: 'st-recibido',
    icon: '👍',
    title: '¡Recibido y Enterado!',
    subtitle: 'Mensaje leído y tomado en cuenta',
    accentColor: 'from-blue-600/30 to-cyan-600/20 border-blue-500/40 text-blue-400 group-hover:border-blue-400',
    fullText: '👍 ¡Recibido y enterado!',
    category: 'respuestas',
  },
  {
    id: 'st-aprobado',
    icon: '✅',
    title: 'Aprobado / Conforme',
    subtitle: 'Proceder con la solicitud',
    accentColor: 'from-emerald-600/30 to-teal-600/20 border-emerald-500/40 text-emerald-400 group-hover:border-emerald-400',
    fullText: '✅ Aprobado / Conforme',
    category: 'respuestas',
  },
  {
    id: 'st-todo-orden',
    icon: '🆗',
    title: 'Todo en Orden',
    subtitle: 'Sin observaciones pendientes',
    accentColor: 'from-teal-600/30 to-emerald-600/20 border-teal-500/40 text-teal-300 group-hover:border-teal-400',
    fullText: '🆗 Todo en orden, sin observaciones.',
    category: 'respuestas',
  },
  {
    id: 'st-muchas-gracias',
    icon: '🙏',
    title: '¡Muchas Gracias!',
    subtitle: 'Agradecimiento por la gestión',
    accentColor: 'from-indigo-600/30 to-violet-600/20 border-indigo-500/40 text-indigo-300 group-hover:border-indigo-400',
    fullText: '🙏 ¡Muchas gracias por la gestión y colaboración!',
    category: 'respuestas',
  },
  {
    id: 'st-excelente-trabajo',
    icon: '👏',
    title: '¡Excelente Trabajo!',
    subtitle: 'Felicitaciones por la tarea',
    accentColor: 'from-amber-600/30 to-yellow-600/20 border-amber-500/40 text-amber-300 group-hover:border-amber-400',
    fullText: '👏 ¡Excelente trabajo! Muy bien resuelto.',
    category: 'respuestas',
  },

  // Estado de Trámites y Documentación
  {
    id: 'st-en-revision',
    icon: '📋',
    title: 'En Revisión Técnica',
    subtitle: 'Analizando expediente o documentación',
    accentColor: 'from-amber-600/30 to-orange-600/20 border-amber-500/40 text-amber-400 group-hover:border-amber-400',
    fullText: '📋 En revisión técnica y análisis de documentación.',
    category: 'tramites',
  },
  {
    id: 'st-en-tramite',
    icon: '⏳',
    title: 'En Trámite',
    subtitle: 'Gestión en curso, a la espera',
    accentColor: 'from-purple-600/30 to-pink-600/20 border-purple-500/40 text-purple-300 group-hover:border-purple-400',
    fullText: '⏳ En trámite. Gestión en curso actualmente.',
    category: 'tramites',
  },
  {
    id: 'st-expediente-listo',
    icon: '📁',
    title: 'Expediente / Nota Lista',
    subtitle: 'Disponible para despacho o firma',
    accentColor: 'from-sky-600/30 to-blue-600/20 border-sky-500/40 text-sky-400 group-hover:border-sky-400',
    fullText: '📁 Expediente / Nota preparada y lista para despacho.',
    category: 'tramites',
  },
  {
    id: 'st-coordinado',
    icon: '🤝',
    title: 'Coordinado y Agendado',
    subtitle: 'Pauta o reunión acordada',
    accentColor: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/40 text-cyan-300 group-hover:border-cyan-400',
    fullText: '🤝 Coordinado y agendado conforme lo convenido.',
    category: 'tramites',
  },
  {
    id: 'st-urgente',
    icon: '🚨',
    title: 'Prioridad Alta / Urgente',
    subtitle: 'Requiere atención inmediata',
    accentColor: 'from-rose-600/30 to-red-600/20 border-rose-500/40 text-rose-400 group-hover:border-rose-400',
    fullText: '🚨 [URGENTE] Prioridad alta. Requiere atención inmediata.',
    category: 'tramites',
  },
  {
    id: 'st-confidencial',
    icon: '🔒',
    title: 'Asunto Reservado',
    subtitle: 'Tratamiento confidencial del sector',
    accentColor: 'from-slate-600/30 to-zinc-600/20 border-slate-500/40 text-slate-300 group-hover:border-slate-400',
    fullText: '🔒 Asunto Reservado / Tratamiento confidencial del sector.',
    category: 'tramites',
  },
  {
    id: 'st-propuesta',
    icon: '💡',
    title: 'Propuesta / Consulta',
    subtitle: 'Para evaluar en el equipo',
    accentColor: 'from-yellow-500/30 to-amber-500/20 border-yellow-400/40 text-yellow-300 group-hover:border-yellow-400',
    fullText: '💡 Propuesta / Consulta para evaluación del equipo.',
    category: 'tramites',
  },

  // Disponibilidad y Estado del Usuario
  {
    id: 'st-pausa',
    icon: '☕',
    title: 'En Pausa Breve',
    subtitle: 'Vuelvo en unos minutos',
    accentColor: 'from-amber-700/30 to-orange-700/20 border-amber-600/40 text-amber-200 group-hover:border-amber-400',
    fullText: '☕ En pausa breve. Vuelvo a estar disponible en unos minutos.',
    category: 'estado',
  },
  {
    id: 'st-llamada',
    icon: '📞',
    title: 'Te llamo en un momento',
    subtitle: 'En comunicación o audiencia',
    accentColor: 'from-blue-600/30 to-indigo-600/20 border-blue-500/40 text-blue-300 group-hover:border-blue-400',
    fullText: '📞 Estoy atendiendo una comunicación. Te llamo en breve.',
    category: 'estado',
  },
  {
    id: 'st-ocupado-tarea',
    icon: '💻',
    title: 'Trabajando en esto',
    subtitle: 'Avanzando con el requerimiento',
    accentColor: 'from-emerald-600/30 to-teal-600/20 border-emerald-500/40 text-emerald-300 group-hover:border-emerald-400',
    fullText: '💻 Estoy trabajando en tu pedido en este momento.',
    category: 'estado',
  },
]

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSendSticker,
  onInsertSticker,
}) => {
  const [activeTab, setActiveTab] = useState<'emojis' | 'stickers'>('emojis')
  const [selectedCategory, setSelectedCategory] = useState<string>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Filtrado de emojis
  const filteredEmojis = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return EMOJI_DATABASE.filter((item) => {
      const matchesCategory =
        selectedCategory === 'todos' || item.category === selectedCategory
      const matchesSearch =
        !q || item.emoji.includes(q) || item.name.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [searchQuery, selectedCategory])

  // Filtrado de stickers
  const filteredStickers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return STICKERS_DATABASE
    return STICKERS_DATABASE.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.fullText.toLowerCase().includes(q)
    )
  }, [searchQuery])

  if (!isOpen) return null

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-3 left-0 sm:left-2 w-[calc(100vw-1.5rem)] sm:w-[380px] max-w-[420px] rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/80 z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 select-none text-slate-100"
      style={{ maxHeight: '420px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('emojis')
              setSelectedCategory('todos')
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'emojis'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smile className="h-3.5 w-3.5" />
            <span>Emojis</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'stickers'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sticker className="h-3.5 w-3.5" />
            <span>Stickers</span>
            <span className="px-1 py-0.2 text-[9px] rounded-full bg-blue-400/20 text-blue-300">
              Pro
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Cerrar (Esc)"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800/80 bg-slate-900/50">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'emojis'
                ? 'Buscar emoji (ej: pulgar, check, sonrisa)...'
                : 'Buscar sticker institucional...'
            }
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills (Only for Emojis) */}
      {activeTab === 'emojis' && (
        <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-slate-800/60 overflow-x-auto no-scrollbar text-[11px]">
          <button
            type="button"
            onClick={() => setSelectedCategory('todos')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'todos'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('frecuentes')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'frecuentes'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Frecuentes
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('caritas')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'caritas'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Caritas
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('gestos')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'gestos'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Gestos
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('oficina')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'oficina'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Oficina
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('simbolos')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'simbolos'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Símbolos
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('celebracion')}
            className={`px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'celebracion'
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Celebración
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar min-h-[220px]">
        {activeTab === 'emojis' ? (
          <div>
            {filteredEmojis.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No se encontraron emojis para "{searchQuery}"
              </div>
            ) : (
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
                {filteredEmojis.map((item, idx) => (
                  <button
                    key={`${item.emoji}-${idx}`}
                    type="button"
                    onClick={() => onSelectEmoji(item.emoji)}
                    title={item.name}
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-xl sm:text-2xl hover:bg-slate-800/80 active:scale-90 transition cursor-pointer hover:shadow-inner"
                  >
                    <span>{item.emoji}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tab de Stickers */
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 text-[11px] text-slate-400">
              <span>Respuestas institucionales rápidas</span>
              <span className="text-[10px] text-blue-400">Clic para enviar directo</span>
            </div>

            {filteredStickers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No se encontraron stickers para "{searchQuery}"
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredStickers.map((st) => (
                  <div
                    key={st.id}
                    className={`group relative flex items-center justify-between p-2.5 rounded-xl border bg-gradient-to-r ${st.accentColor} transition-all duration-150 hover:shadow-md cursor-pointer`}
                    onClick={() => {
                      if (onSendSticker) {
                        onSendSticker(st.fullText)
                      } else if (onInsertSticker) {
                        onInsertSticker(st.fullText)
                      }
                      onClose()
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl drop-shadow">{st.icon}</span>
                      <div className="text-left">
                        <div className="text-xs font-semibold text-white tracking-wide">
                          {st.title}
                        </div>
                        <div className="text-[10px] text-slate-300/80 line-clamp-1">
                          {st.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      {/* Botón para solo insertar en el textarea sin enviar directo */}
                      {onInsertSticker && (
                        <button
                          type="button"
                          title="Insertar en texto sin enviar"
                          onClick={(e) => {
                            e.stopPropagation()
                            onInsertSticker(st.fullText)
                            onClose()
                          }}
                          className="p-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}

                      {/* Botón enviar directo */}
                      <div
                        title="Enviar directamente"
                        className="p-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition cursor-pointer"
                      >
                        <Send className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-950/70 text-[10px] text-slate-500 flex items-center justify-between">
        <span>
          {activeTab === 'emojis'
            ? `${filteredEmojis.length} emojis disponibles`
            : `${filteredStickers.length} stickers institucionales`}
        </span>
        <span className="text-slate-400">Esc para cerrar</span>
      </div>
    </div>
  )
}
