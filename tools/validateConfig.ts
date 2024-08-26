import { logger } from '../lib/logger.js';

import { RevolverConfig } from '../lib/config.js';
import environ from '../lib/environ.js';

/**
 * Validate the configuration provided by $CONFIG_FILE environment variable
 * @returns a parsed and validated configuration object
 */
async function validateConfig(): Promise<object> {
  // Note: configuration is not especially strict (unknown keys are ignored/stripped)
  const config = await (environ.configPath
    ? RevolverConfig.readConfigFromFile(environ.configPath)
    : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!));

  // Check that NONE of the file-output parameters are specified
  // const filePaths = [
  //   config.defaults.settings.resourceLog?.json?.file,
  //   config.defaults.settings.resourceLog?.html?.file,
  //   config.defaults.settings.resourceLog?.csv?.file,
  //   config.defaults.settings.auditLog?.html?.file,
  //   config.defaults.settings.auditLog?.csv?.file,
  //   config.defaults.settings.auditLog?.json?.file,
  //   config.defaults.settings.localResourcesFile,
  //   config.defaults.settings.localOrgAccountsFile,
  //   config.defaults.settings.localOrgAccountsWriteFile,
  // ];
  // const found = filePaths.filter((p) => p !== undefined);
  // if (found.length > 0) {
  //   throw Error(`Found file-paths specified in config file: ${found}`);
  // }

  return config;
}

validateConfig().then((config) => logger.info('Dumping validated configuration', config));
