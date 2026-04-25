// integrations/telegram-bot/src/services/imageFingerprint.ts
import axios from 'axios';
import sharp from 'sharp';

export interface ImageFingerprint {
  hash: string;
  version: number;
}

const HASH_SIZE = 32;

export async function generateFingerprint(imageUrl: string): Promise<ImageFingerprint> {
  const { data } = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 8000,
    maxContentLength: 10 * 1024 * 1024,
  });

  const buffer = Buffer.from(data);

  const resized = await sharp(buffer)
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  const hash = averageHash(resized);

  return { hash, version: 1 };
}

function averageHash(buffer: Buffer): string {
  const pixels = Array.from(buffer);
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;

  let hash = '';
  for (let i = 0; i < pixels.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8 && i + j < pixels.length; j++) {
      if (pixels[i + j] >= avg) byte |= 1 << (7 - j);
    }
    hash += byte.toString(16).padStart(2, '0');
  }
  return hash;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += xor.toString(2).replace(/0/g, '').length;
  }
  return dist;
}

export function isVisuallySame(a: string, b: string, threshold = 25): boolean {
  return hammingDistance(a, b) <= threshold;
}