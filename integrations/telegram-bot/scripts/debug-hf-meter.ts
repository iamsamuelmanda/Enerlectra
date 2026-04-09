// scripts/debug-hf-meter.ts
import { InferenceClient } from '@huggingface/inference';

async function main() {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error('HF_TOKEN not set');

  const client = new InferenceClient(token);
  const imageUrl = process.argv[2];
  if (!imageUrl) throw new Error('Usage: ts-node scripts/debug-hf-meter.ts <image-url>');

  const res = await client.ocr({
    model: 'nvidia/nemotron-ocr-v1', // <-- change here
    data: { image: { url: imageUrl } },
  });

  console.dir(res, { depth: null });
}

main().catch(console.error);