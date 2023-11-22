class Environ {
  debugLevel: string;
  configPath: string | undefined;
  configBucket: string | undefined;
  configKey: string;
  baseBackoff: number;
  maxRetries: number;
}

const environ = new Environ();

environ.debugLevel = process.env['DEBUG_LEVEL'] || 'debug';
environ.configPath = process.env['CONFIG_FILE'];
environ.configBucket = process.env['S3_BUCKET'];
environ.configKey = process.env['S3_KEY'] || 'config/revolver.yaml';
environ.baseBackoff = parseInt(process.env['SDK_BASE_BACKOFF'] || '300', 10);
environ.maxRetries = parseInt(process.env['SDK_MAX_RETRIES'] || '30', 10);

export default environ;
