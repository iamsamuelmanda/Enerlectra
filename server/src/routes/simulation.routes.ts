import { Router } from 'express';
import { runClusterSimulation } from '../controllers/simulation.controller';

const router = Router();

// Endpoint: POST /api/simulation/run
router.post('/run', runClusterSimulation);

export default router;