import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../lib/config-schema.js';
import * as fs from 'node:fs';

const jsonSchema = zodToJsonSchema(ConfigSchema.describe('Revolver configuration schema'));
fs.writeFileSync('../revolver-config-schema.json', JSON.stringify(jsonSchema, null, 2));
