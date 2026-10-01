/**
 * Synthesizes an alert chime using Web Audio API.
 * Plays a warm 3-note ascending chord (C6 -> E6 -> G6) with smooth gain decay.
 */
export function playOrderChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    playNote(1046.5, now, 0.35);      // C6
    playNote(1318.5, now + 0.12, 0.45); // E6
    playNote(1567.98, now + 0.24, 0.6); // G6
  } catch {
    // Autoplay policy or unsupported audio environment
  }
}
