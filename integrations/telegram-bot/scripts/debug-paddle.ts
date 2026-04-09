// scripts/debug-paddle.ts
import { PaddleOcrService } from 'ppu-paddle-ocr';
import fs from 'node:fs';

async function main() {
  const service = new PaddleOcrService({
    debugging: { debug: true, verbose: true },
    session: { executionProviders: ['cpu'] },
  });

  await service.initialize();

  const imgPath = process.argv[2];
  if (!imgPath) throw new Error('Usage: ts-node scripts/debug-paddle.ts meter.jpg');

  const nodeBuf = fs.readFileSync(imgPath);
  const arrayBuf = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  );

  const result = await service.recognize(arrayBuf); // <-- now ArrayBuffer
  console.dir(result, { depth: null });
}

main().catch(console.error);