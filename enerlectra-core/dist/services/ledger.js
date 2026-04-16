import { atomicWriteJson } from '../engines/atomicWrite';
import { storeFile } from '../engines/storePath';
import * as fs from 'fs';
import * as path from 'path';
export function recordContribution(entry) {
    if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        atomicWriteJson(file, []);
    }
    const raw = fs.readFileSync(file, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : [];
    data.push(entry);
    atomicWriteJson(file, data);
}
const file = storeFile('contributions.json');
