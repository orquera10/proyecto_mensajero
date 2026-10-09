// Web Audio API notification chime generator
let audioCtx: AudioContext | null = null

export const soundService = {
  playNotificationSound() {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          audioCtx = new AudioContextClass()
        }
      }

      if (!audioCtx) return

      if (audioCtx.state === 'suspended') {
        audioCtx.resume()
      }

      const now = audioCtx.currentTime

      // First tone (G5)
      const osc1 = audioCtx.createOscillator()
      const gain1 = audioCtx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(783.99, now) // G5
      gain1.gain.setValueAtTime(0, now)
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.02)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

      osc1.connect(gain1)
      gain1.connect(audioCtx.destination)

      osc1.start(now)
      osc1.stop(now + 0.25)

      // Second tone (C6 - higher chime)
      const osc2 = audioCtx.createOscillator()
      const gain2 = audioCtx.createGain()

      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1046.5, now + 0.1) // C6
      gain2.gain.setValueAtTime(0, now + 0.1)
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc2.connect(gain2)
      gain2.connect(audioCtx.destination)

      osc2.start(now + 0.1)
      osc2.stop(now + 0.45)
    } catch (e) {
      console.warn('Error playing audio chime:', e)
    }
  },
}
