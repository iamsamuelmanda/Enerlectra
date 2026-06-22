import { logger } from './logger';

const HF_API_URL = 'https://api-inference.huggingface.co/models/';
const MODEL = process.env.HF_MODEL || 'google/flan-t5-small';

export async function queryHuggingFace(prompt: string): Promise<string> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    throw new Error('HF_API_KEY not configured');
  }

  const response = await fetch(`${HF_API_URL}${MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HF API error ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as
    | Array<{ generated_text?: string }>
    | { generated_text?: string };

  const generatedText = Array.isArray(result)
    ? result[0]?.generated_text
    : result?.generated_text;

  if (!generatedText) {
    logger.warn({ result }, 'Hugging Face returned empty response');
    return 'No response';
  }

  return generatedText.trim();
}


