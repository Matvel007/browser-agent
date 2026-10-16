let audio: AudioContext | undefined;

export async function unlockAudio() {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') await audio.resume();
  } catch { /* Playback can be unavailable until a user gesture. Chat remains functional. */ }
}

export async function playCompletion(volume = 0.2) {
  if (volume <= 0) return;
  try {
    await unlockAudio();
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    for (const [offset, frequency] of [[0, 660], [0.12, 880]]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 0.16, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now + offset); oscillator.stop(now + offset + 0.18);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch { /* Optional notification; never fail a completed task. */ }
}
