// src/routes/suppliers.ts
import { Router } from 'express';
import { supabase } from '../../../enerlectra-core/src/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function readJsonArray(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : [];
}

function writeJsonArray(filePath: string, data: any[]): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const suppliersFile = path.join(dataDir, 'suppliers.json');
const productsFile = path.join(dataDir, 'products.json');

// POST /suppliers
router.post('/suppliers', async (req, res) => {
  const { name, contact } = req.body;

  if (!name || !contact) {
    return res.status(400).json({ error: 'Invalid supplier payload' });
  }

  const supplier = {
    supplierId: generateId('sup'),
    name,
    contact,
    createdAt: new Date().toISOString(),
  };

  // Hybrid: JSON + Supabase
  const suppliers = readJsonArray(suppliersFile);
  suppliers.push(supplier);
  writeJsonArray(suppliersFile, suppliers);

  // Also persist to Supabase
  try {
    await supabase.from('suppliers').insert(supplier);
  } catch (error) {
    console.error('Supabase insert failed:', error);
  }

  res.status(201).json(supplier);
});

// POST /suppliers/:id/products
router.post('/suppliers/:id/products', async (req, res) => {
  const { id } = req.params;
  const { type, model, capacityKW, priceZMW } = req.body;

  if (!type || !model || capacityKW == null || priceZMW == null) {
    return res.status(400).json({ error: 'Invalid product payload' });
  }

  const suppliers = readJsonArray(suppliersFile);
  const supplier = suppliers.find((s: any) => s.supplierId === id);
  if (!supplier) {
    return res.status(404).json({ error: 'Supplier not found' });
  }

  const product = {
    productId: generateId('prd'),
    supplierId: id,
    type,
    model,
    capacityKW,
    priceZMW,
    createdAt: new Date().toISOString(),
  };

  const products = readJsonArray(productsFile);
  products.push(product);
  writeJsonArray(productsFile, products);

  // Also persist to Supabase
  try {
    await supabase.from('products').insert(product);
  } catch (error) {
    console.error('Supabase insert failed:', error);
  }

  res.status(201).json(product);
});

export default router;