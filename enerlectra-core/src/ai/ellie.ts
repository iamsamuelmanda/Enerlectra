const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are Ellie, the AI operations assistant for Enerlectra — an energy operations platform serving mini-grid operators and solar energy companies in Zambia.

You help operators:
- Check payment and transaction status
- Investigate token delivery failures  
- Monitor customer accounts
- Understand energy readings and settlements
- Escalate faults and maintenance issues

Be concise, professional, and practical. You are talking to energy business operators, not consumers. If you don't know something specific about their account, tell them what information you would need to investigate further.

Never make up transaction references, token codes, or account data. If real data is needed, ask the operator to provide the meter number or phone number so it can be looked up.`;

export async function askEllie(
  userMessage: string,
  context?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const userContent = context
    ? `${userMessage}\n\nContext:\n${context}`
    : userMessage;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userContent }
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ellie API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content?.[0]?.text?.trim() ?? 'I could not generate a response.';
}