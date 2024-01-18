class Environ {
  logFormat: 'json' | 'pretty' | 'hidden' | undefined;
  logLevel: string;
  configPath: string | undefined;
  configBucket: string | undefined;
  configKey: string;
  baseBackoff: number;
  maxRetries: number;
  httpsProxy: string | undefined;
}

const environ = new Environ();

environ.logFormat = (process.env['LOG_FORMAT'] as 'json' | 'pretty' | 'hidden' | undefined) || 'pretty';
environ.logLevel = process.env['DEBUG_LEVEL'] || 'debug';
environ.configPath = process.env['CONFIG_FILE'];
environ.configBucket = process.env['S3_BUCKET'];
environ.configKey = process.env['S3_KEY'] || 'config/revolver.yaml';
environ.baseBackoff = parseInt(process.env['SDK_BASE_BACKOFF'] || '300', 10);
environ.maxRetries = parseInt(process.env['SDK_MAX_RETRIES'] || '30', 10);
environ.httpsProxy = process.env['HTTPS_PROXY'];

export default environ;
