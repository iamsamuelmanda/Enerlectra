// Kernel Core Implementation
// This file is the public composition root singleton.
// It composes the full kernel via createKernel() and exposes it for consumers.

import { createKernel } from '../bootstrap/create-kernel.js';

// Compose the kernel once at module load (no runtime behaviour change).
// The Telegram bot is optional and wired by adapters that own a bot instance.
export const kernel = createKernel();