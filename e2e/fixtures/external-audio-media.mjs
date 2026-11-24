export function wave(seconds = 1, frequency = 0) {
  const audio = Buffer.alloc(44 + 16_000 * seconds);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  for (let sample = 0; frequency && sample < 8000 * seconds; sample++) {
    const note = sample < 4000 * seconds ? frequency : frequency * 1.5;
    audio.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * note * sample / 8000)), 44 + 2 * sample);
  }
  return audio;
}
