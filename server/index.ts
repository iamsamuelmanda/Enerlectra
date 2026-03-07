import 'dotenv/config';
import express from 'express'
import cors from 'cors'
import path from 'path'
import { Settlement } from '../enerlectra-core/src/domain/settlement';

import {
  SettlementState,
  SETTLEMENT_STATES,
} from '../enerlectra-core/src/domain/settlementState';

import { ensureStoreDir, STORE_DIR } from '../enerlectra-core/src/engines/storePath.ts'

// NOTE: add .ts extensions for ESM + ts-node
import clusters from './routes/clusters.ts'
import contributions from './routes/contributions.ts'
import ownership from './routes/ownership.ts'
import distribution from './routes/distribution.ts'
import suppliers from './routes/suppliers.ts'
import distributionFinalize from './routes/distributionFinalize.ts'
import settlement from './routes/settlement.ts'
import lifecycle from './routes/lifecycle.ts';
import ownershipLedgerRouter from "./routes/ownershipLedger";
import systemRouter from './routes/system';

const app = express()
const exchangeAPI = require('./utils/exchangeRate');

app.use(cors())
app.use(express.json())

ensureStoreDir()

const adminDir = path.join(process.cwd(), 'server', 'admin')
app.use(express.static(adminDir))

app.use('/clusters', clusters)
app.use('/contributions', contributions)
app.use('/ownership', ownership)
app.use('/distribution', distribution)
app.use('/suppliers', suppliers)
app.use('/distribution/finalize', distributionFinalize)
app.use('/settlement', settlement)
app.use('/lifecycle', lifecycle);
app.use("/ownership-ledger", ownershipLedgerRouter);
app.use(systemRouter);

app.get('/', (_req, res) => {
  res.sendFile(path.join(adminDir, 'index.html'))
})
app.get('/api/exchange-rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const rate = await exchangeAPI.getLatestRate(from, to);
    res.json({ 
      rate, 
      timestamp: new Date().toISOString(),
      from, 
      to 
    });
  } catch (err) {
    res.status(500).json({ error: 'Rate fetch failed', fallback: 27.5 });
  }
});

const PORT = 4000

app.listen(PORT, () => {
  console.log(`Enerlectra Core running on :${PORT} (store at ${STORE_DIR})`)
})
