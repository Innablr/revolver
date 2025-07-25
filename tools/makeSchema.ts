import * as fs from 'node:fs';
import { z } from 'zod/v4';
import { ConfigSchema } from '../lib/config-schema.js';

// Generate JSON schema for Revolver configuration
console.log('Generating JSON schema for Revolver configuration');
fs.writeFileSync(
  '../revolver-config-schema.json',
  JSON.stringify(z.toJSONSchema(ConfigSchema, { io: 'input' }), null, 2),
);
console.log('Done');
