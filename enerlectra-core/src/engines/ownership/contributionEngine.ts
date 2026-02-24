// enerlectra-core/src/engines/ownership/contributionEngine.ts

// Allowed modes for contributions
export type ContributionMode = 'demo' | 'live';

export type ContributionInput = {
  contributionId?: string;
  clusterId: string;
  userId: string;
  amountZMW: number;
  mode?: ContributionMode | string;
  timestamp?: string;
};

// What this function returns
export type ContributionResult = {
  contributionId: string;
  clusterId: string;
  userId: string;
  amountZMW: number;
  mode: ContributionMode;
  timestamp: string;
};

/**
 * Very simple logger wrapper so it can be swapped out later.
 */
function logInfo(message: string, data?: unknown) {
  // In production, swap this for Winston/Pino etc.
  if (data !== undefined) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}

function logError(message: string, error?: unknown) {
  console.error(message, error);
}

/**
 * Best‑effort unique ID.
 * Replace with UUID if your stack already has it.
 */
function generateContributionId(): string {
  return 'contrib-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Normalize and validate mode.
 */
function normalizeMode(mode?: string): ContributionMode {
  if (!mode) return 'demo';

  const lower = mode.toLowerCase();
  if (lower === 'demo' || lower === 'live') {
    return lower;
  }

  // Fallback to demo if an invalid mode comes in
  logError('Invalid contribution mode received, defaulting to demo', { mode });
  return 'demo';
}

/**
 * Basic validation of the incoming payload.
 * Throws an Error with a descriptive message if invalid.
 */
function validateContributionInput(input: ContributionInput): void {
  if (!input.clusterId || typeof input.clusterId !== 'string') {
    throw new Error('clusterId is required and must be a string');
  }

  if (!input.userId || typeof input.userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  if (typeof input.amountZMW !== 'number' || !Number.isFinite(input.amountZMW)) {
    throw new Error('amountZMW must be a finite number');
  }

  if (input.amountZMW <= 0) {
    throw new Error('amountZMW must be greater than 0');
  }

  if (input.timestamp) {
    const d = new Date(input.timestamp);
    if (Number.isNaN(d.getTime())) {
      throw new Error('timestamp must be a valid ISO 8601 date string');
    }
  }
}

/**
 * Very simple implementation with validation and normalization.
 * Replace with real persistence logic (DB, DynamoDB, etc.) later.
 */
export async function recordContribution(input: ContributionInput): Promise<ContributionResult> {
  try {
    validateContributionInput(input);

    const mode = normalizeMode(input.mode);
    const timestamp = input.timestamp ?? new Date().toISOString();

    const contribution: ContributionResult = {
      contributionId: input.contributionId ?? generateContributionId(),
      clusterId: input.clusterId,
      userId: input.userId,
      amountZMW: input.amountZMW,
      mode,
      timestamp,
    };

    // TODO: persist to database here

    logInfo('Recorded contribution', contribution);

    return contribution;
  } catch (err) {
    logError('Failed to record contribution', err);
    // Re‑throw so the API layer can send a proper HTTP error
    throw err;
  }
}
