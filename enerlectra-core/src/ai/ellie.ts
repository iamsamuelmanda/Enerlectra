const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface EllieInference {
  summary: string;
  rationale: string;
  recommendationType: string;
  confidence: number;
  proposedWorkType?: string;
  evidenceUsed: string[];
  learningSignal?: string;
  targetSituationId?: string;
  targetResourceIds: string[];
}

const SYSTEM_PROMPT = `You are Ellie, Enerlectra's tenant-scoped operational intelligence layer.

You operate across energy businesses with different operating models. The supplied context is authoritative and already tenant-scoped.

Your responsibilities:
- understand the operator's request in the organization's operating context;
- reason from supplied operational evidence, situations, work, policies, capabilities and verified organizational memories;
- explain uncertainty rather than inventing facts;
- produce practical, bounded recommendations;
- identify useful operational work when appropriate.

Hard rules:
- Never invent customer, meter, payment, asset, transaction, site or operational facts.
- Never claim authority you do not have.
- Never authorize, execute or verify an action.
- Never infer that a business-model descriptor grants permission.
- Treat supplied tenant context as the only authoritative organizational data.
- Do not reveal or compare another organization's information.
- Distinguish canonical FACTS from organizational PROCEDURES, POLICIES, PATTERNS, PREFERENCES and recommendation OUTCOMES.
- A recommendation outcome is not automatically a procedure or organizational pattern.
- Never turn one successful recommendation into organizational doctrine.
- Use a learningSignal only for the verified outcome of the current case; do not phrase it as a universal rule unless the supplied evidence already establishes a repeated pattern.
- Prefer a bounded recommendation over an irreversible action.

You are speaking to energy business operators. Be concise, specific and operational.`;

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\s*\`\`\`$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Ellie returned non-JSON inference output');
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

async function callEllie(userContent: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ellie API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((item) => item.type === 'text')?.text?.trim() ?? '';
}

export async function askEllie(userMessage: string, context?: string): Promise<string> {
  const userContent = context ? `${userMessage}\n\nContext:\n${context}` : userMessage;
  return callEllie(userContent, 700);
}

export async function askEllieStructured(userMessage: string, context: string): Promise<EllieInference> {
  const instruction = `${userMessage}

Authoritative context:
${context}

Return ONLY one JSON object with this exact shape:
{
  "summary": "short operational conclusion",
  "rationale": "why this follows from the evidence and context",
  "recommendationType": "INVESTIGATE|MONITOR|CONTACT_CUSTOMER|FIELD_CHECK|RECONCILE|ESCALATE|NO_ACTION",
  "confidence": 0.0,
  "proposedWorkType": "optional work type or empty string",
  "evidenceUsed": ["IDs of evidence/situations/memories actually used"],
  "targetSituationId": "ID of the situation this recommendation concerns, or empty string if none",
  "targetResourceIds": ["canonical customer/site/asset/resource IDs directly concerned, if known"],
  "learningSignal": "one short outcome statement about this case only if the supplied evidence supports learning, otherwise empty string"
}

Confidence must be between 0 and 1. Do not manufacture evidence IDs. If evidence is insufficient, say so in the rationale and lower confidence.\n\nRecommendation type must be exactly one of INVESTIGATE, MONITOR, CONTACT_CUSTOMER, FIELD_CHECK, RECONCILE, ESCALATE, NO_ACTION.\nTarget situation must be an ID from the supplied context or empty string. Target resource IDs must come only from supplied context.`;

  const raw = await callEllie(instruction, 900);
  const parsed = parseJsonObject(raw);
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Ellie returned invalid confidence');
  }

  const recommendationTypes = new Set(['INVESTIGATE','MONITOR','CONTACT_CUSTOMER','FIELD_CHECK','RECONCILE','ESCALATE','NO_ACTION']);
  const recommendationType = String(parsed.recommendationType ?? 'NO_ACTION').trim();
  if (!recommendationTypes.has(recommendationType)) throw new Error('Ellie returned invalid recommendation type');
  const targetSituationId = String(parsed.targetSituationId ?? '').trim();
  const targetResourceIds = Array.isArray(parsed.targetResourceIds)
    ? parsed.targetResourceIds.map(String).map((value) => value.trim()).filter(Boolean)
    : [];

  return {
    summary: String(parsed.summary ?? '').trim(),
    rationale: String(parsed.rationale ?? '').trim(),
    recommendationType,
    confidence,
    proposedWorkType: String(parsed.proposedWorkType ?? '').trim() || undefined,
    evidenceUsed: Array.isArray(parsed.evidenceUsed) ? parsed.evidenceUsed.map(String) : [],
    learningSignal: String(parsed.learningSignal ?? '').trim() || undefined,
    targetSituationId: targetSituationId || undefined,
    targetResourceIds,
  };
}
