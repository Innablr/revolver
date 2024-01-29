import { logger } from './logger';
import { promises as fs } from 'fs';
import path = require('node:path');
import yaml from 'js-yaml';
import { Organizations, paginateListAccounts } from '@aws-sdk/client-organizations';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { paginateAwsCall } from './common';
import { merge } from 'ts-deepmerge';
import { getAwsConfig } from './awsConfig';

export class RevolverConfig {
  validateConfig(data: string) {
    const config: any = yaml.load(data);
    if (!Array.isArray(config.accounts.includeList)) {
      throw new Error('Invalid configuration: "includeList" key is either missing or not an array');
    }
    if (!Array.isArray(config.accounts.excludeList)) {
      throw new Error('Invalid configuration: "excludeList" key is either missing or not an array');
    }
    // merge default settings and extract some info
    config.organizations.forEach((org: any) => {
      org.settings = Object.assign({}, config.defaults.settings, org.settings);
    });

    config.accounts.includeList.forEach((account: any) => {
      account.settings = Object.assign({}, config.defaults.settings, account.settings);
    });

    logger.debug('Read Revolver config', config);
    return config;
  }

  async readConfigFromFile(configFile: string) {
    const fullPath = path.resolve(configFile);
    logger.debug(`Fetching config from file ${fullPath}`);
    return this.validateConfig(await fs.readFile(fullPath, { encoding: 'utf8' }));
  }

  async readConfigFromS3(configBucket: string, configKey: string): Promise<string> {
    const config = getAwsConfig();
    const s3 = new S3Client(config);
    logger.debug(`Fetching config from bucket [${configBucket}] key [${configKey}]`);

    const configObject = await s3.send(new GetObjectCommand({ Bucket: configBucket, Key: configKey }));
    logger.debug(`Found S3 object MIME ${configObject.ContentType}`);
    return this.validateConfig(await configObject.Body!.transformToString());
  }

  async getOrganisationsAccounts(creds: any[]) {
    const orgsRegion = 'us-east-1';
    const allAccounts = await Promise.all(
      creds.map(async (cr: any) => {
        const config = getAwsConfig(orgsRegion, cr);
        const client = new Organizations(config); // TODO: check this works
        const accounts = await paginateAwsCall(paginateListAccounts, client, 'Accounts');
        accounts.forEach((account) => {
          account.accountId = account.Id;
          delete account.Id;
          account.settings = {
            name: account.Name,
            region: cr.settings.region,
            timezone: cr.settings.timezone,
            timezoneTag: cr.settings.timezoneTag,
            revolverRoleName: cr.settings.revolverRoleName,
          };
        });
        return accounts;
      }),
    );
    const flatAccounts = allAccounts.flat();
    logger.info(`${flatAccounts.length} Accounts found on the Organizations listed`);
    return flatAccounts;
  }

  filterAccountsList(orgsAccountsList: any[], config: any) {
    logger.info(`${orgsAccountsList.length} Accounts found on the Organizations listed`);
    logger.info(`${config.accounts.includeList.length} accounts found on include_list`);
    logger.info(`${config.accounts.excludeList.length} accounts found on exclude_list`);
    // exclude specified in includeList accounts from the org list
    const orgWithoutIncludeList = orgsAccountsList.filter(
      (xa: any) =>
        !config.accounts.includeList.find(
          (xi: any) => xi.accountId === xa.accountId && xi.settings.region === xa.settings.region,
        ),
    );
    const accountList = orgWithoutIncludeList.concat(config.accounts.includeList);
    // exclude accounts specified in excludeList
    const filteredAccountsList = accountList.filter(
      (xa: any) => !config.accounts.excludeList.find((xi: any) => xi.accountId === xa.accountId),
    );
    // build assumeRoleArn string, extract account_id and revolver_role_name
    const updatedAccountsList = filteredAccountsList.map((xa: any) => {
      const account: any = merge.withOptions({ mergeArrays: false }, xa, config.defaults);
      account.settings.assumeRoleArn = `arn:aws:iam::${account.accountId}:role/${account.settings.revolverRoleName}`;
      return account;
    });

    return updatedAccountsList;
  }
}
