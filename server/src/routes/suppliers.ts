import { atomicWriteJson } from '../../enerlectra-core/src/engines/atomicWrite.ts'
import { storeFile } from '../../enerlectra-core/src/engines/storePath.ts'
import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { generateId } from '../../enerlectra-core/src/utils/id.ts'

const router = Router()

// Add these:
const suppliersFile = storeFile('suppliers.json')
const productsFile = storeFile('products.json')

function readJsonArray(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    atomicWriteJson(filePath, [])
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  return raw.trim() ? JSON.parse(raw) : []
}

function writeJsonArray(filePath: string, data: any[]): void {
  atomicWriteJson(filePath, data)
}

// POST /suppliers
router.post('/suppliers', (req, res) => {
  const { name, contact } = req.body

  if (!name || !contact) {
    return res.status(400).json({ error: 'Invalid supplier payload' })
  }

  const suppliers = readJsonArray(suppliersFile)

  const supplier = {
    supplierId: generateId('sup'),
    name,
    contact,
    createdAt: new Date().toISOString()
  }

  suppliers.push(supplier)
  writeJsonArray(suppliersFile, suppliers)

  res.status(201).json(supplier)
})

// POST /suppliers/:id/products
router.post('/suppliers/:id/products', (req, res) => {
  const { id } = req.params
  const { type, model, capacityKW, priceZMW } = req.body

  if (!type || !model || capacityKW == null || priceZMW == null) {
    return res.status(400).json({ error: 'Invalid product payload' })
  }

  const suppliers = readJsonArray(suppliersFile)
  const supplier = suppliers.find((s: any) => s.supplierId === id)
  if (!supplier) {
    return res.status(404).json({ error: 'Supplier not found' })
  }

  const products = readJsonArray(productsFile)

  const product = {
    productId: generateId('prd'),
    supplierId: id,
    type,
    model,
    capacityKW,
    priceZMW,
    createdAt: new Date().toISOString()
  }

  products.push(product)
  writeJsonArray(productsFile, products)

  res.status(201).json(product)
})

export default router
