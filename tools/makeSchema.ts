import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../lib/config-schema.js';
import * as fs from 'node:fs';

// Generate JSON schema for Revolver configuration
console.log('Generating JSON schema for Revolver configuration');
fs.writeFileSync(
  '../revolver-config-schema.json',
  JSON.stringify(zodToJsonSchema(ConfigSchema.describe('Revolver configuration schema')), null, 2),
);
console.log('Done');
