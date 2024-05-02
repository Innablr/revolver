class Environ {
  logFormat: 'json' | 'pretty' | 'hidden' | undefined;
  stylePrettyLogs: boolean;
  prettyLogTimeZone: 'UTC' | 'local' | undefined;
  logLevel: string;
  configPath: string | undefined;
  configBucket: string | undefined;
  configKey: string;
  baseBackoff: number;
  connectionTimeout: number;
  requestTimeout: number;
  maxRetries: number;
  httpsProxy: string | undefined;
}

const environ = new Environ();

environ.logFormat = (process.env['LOG_FORMAT'] as 'json' | 'pretty' | 'hidden' | undefined) || 'pretty';
environ.stylePrettyLogs = (process.env['STYLE_PRETTY_LOGS'] || 'true') == 'true';
environ.prettyLogTimeZone = process.env['PRETTY_LOG_TIME_ZONE'] as 'UTC' | 'local' | undefined;
environ.logLevel = process.env['LOG_LEVEL'] || process.env['DEBUG_LEVEL'] || 'debug';
environ.configPath = process.env['CONFIG_FILE'];
environ.configBucket = process.env['S3_BUCKET'];
environ.configKey = process.env['S3_KEY'] || 'config/revolver.yaml';
environ.baseBackoff = parseInt(process.env['SDK_BASE_BACKOFF'] || '300', 10);
environ.connectionTimeout = parseInt(process.env['SDK_CONNECTION_TIMEOUT_MS'] || '0', 10);
environ.requestTimeout = parseInt(process.env['SDK_REQUEST_TIMEOUT_MS'] || '0', 10);
environ.maxRetries = parseInt(process.env['SDK_MAX_RETRIES'] || '30', 10);
environ.httpsProxy = process.env['HTTPS_PROXY'];

export default environ;
