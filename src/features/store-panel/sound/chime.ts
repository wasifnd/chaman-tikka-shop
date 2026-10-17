/** The small part of the Web Audio API the chime needs, so it can be faked in tests. */
export type AudioContextLike = Pick<
  AudioContext,
  'createOscillator' | 'createGain' | 'destination' | 'currentTime' | 'resume' | 'state'
>;

/** Two rising notes, loud enough to notice across a kitchen but short enough not to annoy. */
const NOTES = [
  { frequency: 880, start: 0, length: 0.18 },
  { frequency: 1175, start: 0.2, length: 0.28 },
] as const;

export function playChime(context: AudioContextLike, volume = 0.25): void {
  const now = context.currentTime;
  for (const note of NOTES) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency;

    // Fade in and out so there is no harsh click at the start or end of each note.
    const begin = now + note.start;
    const end = begin + note.length;
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.exponentialRampToValueAtTime(volume, begin + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(begin);
    oscillator.stop(end + 0.02);
  }
}

/** Where a browser keeps its audio constructor; older Safari uses the webkit-prefixed name. */
export interface AudioSource {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/** A new audio context, or null where the browser has no Web Audio (or blocks it). */
export function createAudioContext(source: AudioSource = window): AudioContextLike | null {
  const Context = source.AudioContext ?? source.webkitAudioContext;
  if (!Context) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
}
