import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sampleRate = 22050;
const outputDirectory = join(process.cwd(), 'assets', 'audio');
const effects = {
  move: [{ frequency: 660, duration: 0.045 }],
  rotate: [
    { frequency: 440, duration: 0.055 },
    { frequency: 660, duration: 0.075 },
  ],
  land: [{ frequency: 245, duration: 0.105 }],
  lineClear: [
    { frequency: 523, duration: 0.065 },
    { frequency: 659, duration: 0.065 },
    { frequency: 784, duration: 0.065 },
    { frequency: 1047, duration: 0.14 },
  ],
  gameOver: [
    { frequency: 392, duration: 0.1 },
    { frequency: 330, duration: 0.12 },
    { frequency: 262, duration: 0.19 },
  ],
  collision: [{ frequency: 310, duration: 0.04 }],
  victory: [
    { frequency: 523, duration: 0.09 },
    { frequency: 659, duration: 0.09 },
    { frequency: 784, duration: 0.09 },
    { frequency: 1047, duration: 0.22 },
  ],
};

function encodeWav(notes) {
  const noteSamples = notes.map((note) => ({
    ...note,
    samples: Math.floor(note.duration * sampleRate),
  }));
  const dataSize = noteSamples.reduce((sum, note) => sum + note.samples * 2, 0);
  const wav = Buffer.alloc(44 + dataSize);
  const channels = 1;
  const bitsPerSample = 16;

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  wav.writeUInt16LE(channels * bitsPerSample / 8, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  let offset = 44;

  for (const note of noteSamples) {
    const attackSamples = Math.max(1, Math.floor(sampleRate * 0.004));
    const releaseSamples = Math.max(1, Math.floor(sampleRate * 0.018));

    for (let index = 0; index < note.samples; index += 1) {
      const attack = Math.min(1, index / attackSamples);
      const release = Math.min(1, (note.samples - index) / releaseSamples);
      const phase = 2 * Math.PI * note.frequency * index / sampleRate;
      const tone = Math.sin(phase) * 0.78 + Math.sin(phase * 2) * 0.22;
      const sample = Math.max(-1, Math.min(1, tone * attack * release * 0.34));
      wav.writeInt16LE(Math.round(sample * 32767), offset);
      offset += 2;
    }
  }

  return wav;
}

mkdirSync(outputDirectory, { recursive: true });

for (const [name, notes] of Object.entries(effects)) {
  const filePath = join(outputDirectory, `${name}.wav`);
  const wav = encodeWav(notes);
  writeFileSync(filePath, wav);
  console.log(`${name}: ${wav.length} bytes`);
}