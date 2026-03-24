import { Router } from 'express';
// Fixed: Added .js extension for ESM compatibility
import { runClusterSimulation } from '../controllers/simulation.controller.js';

const router = Router();

/**
 * AI-Powered Simulation Engine (Claude 3.5 Sonnet)
 * Endpoint: POST /api/simulation/run
 */
router.post('/run', runClusterSimulation);

export default router;