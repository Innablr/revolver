import logger from './logger';
import { promises as fs } from 'fs';
import path = require('node:path');
import * as yaml from 'js-yaml';
import { Organizations, S3 } from 'aws-sdk';
import { paginateAwsCall, uniqueBy } from './common';
import { deepmerge } from 'deepmerge-ts';

class Settings {
  private settings: { [key: string]: any };

  constructor() {
    this.settings = {};
  }

  store(settings: { [key: string]: any }) {
    this.settings = settings;
  }

  get(key: string) {
    return this.settings[key];
  }
}

export const settings = new Settings();

export class RevolverConfig {
  validateConfig(data: string) {
    const config: any = yaml.load(data);
    logger.debug('Read Revolver config: %j', config);
    if (!Array.isArray(config.accounts.include_list)) {
      throw new Error("Invalid configuration. 'include_list' key is either missing or not an array");
    }
    if (!Array.isArray(config.accounts.exclude_list)) {
      throw new Error("Invalid configuration. 'exclude_list' key is either missing or not an array");
    }
    settings.store(config.settings);
    // merge default settings and extract some info
    config.organizations = config.organizations.map((r: any) => deepmerge({}, config.defaults, r));
    config.accounts.include_list = config.accounts.include_list.map((r: any) => deepmerge(config.defaults, r));
    config.accounts.exclude_list = config.accounts.exclude_list.map((r: any) => deepmerge(config.defaults, r));

    config.defaults.settings.organizationRoleName = config.defaults.settings.organization_role_name;
    config.defaults.settings.revolverRoleName = config.defaults.settings.revolver_role_name;

    config.organizations.map((org: any) => {
      org.Id = org.account_id;
      org.settings.organizationRoleName = org.settings.organization_role_name;
      org.settings.revolverRoleName = org.settings.revolver_role_name;
    });
    config.accounts.include_list.map((acc: any) => {
      acc.Id = acc.account_id;
      acc.settings.revolverRoleName = acc.settings.revolver_role_name;
    });
    config.accounts.exclude_list.map((acc: any) => {
      acc.Id = acc.account_id;
      acc.settings.revolverRoleName = acc.settings.revolver_role_name;
    });

    logger.debug('Final Revolver config: %j', config);
    return config;
  }

  async readConfigFromFile(configFile: string) {
    const fullPath = path.resolve(configFile);
    logger.debug(`Fetching config from file ${fullPath}`);
    return this.validateConfig(await fs.readFile(fullPath, { encoding: 'utf8' }));
  }

  async readConfigFromS3(configBucket: string, configKey: string): Promise<string> {
    const s3 = new S3();
    logger.debug(`Fetching config from bucket [${configBucket}] key [${configKey}]`);

    const configObject = await s3.getObject({ Bucket: configBucket, Key: configKey }).promise();
    logger.debug(`Found S3 object MIME ${configObject.ContentType}`);
    return this.validateConfig(configObject.Body!.toString('utf8'));
  }

  async getOrganisationsAccounts(creds: any[]) {
    const orgsRegion = 'us-east-1';
    const allAccounts = await Promise.all(
      creds.map(async (cr: any) => {
        const client = new Organizations({ credentials: cr, region: orgsRegion });
        const accounts = await paginateAwsCall(client.listAccounts.bind(client), 'Accounts');
        accounts.forEach((account) => {
          account.settings = {
            name: account.Name,
            region: cr.settings.region,
            timezone: cr.settings.timezone,
            revolverRoleName: cr.settings.revolver_role_name,
          };
        });
        return accounts;
      }),
    );
    const flatAccounts = allAccounts.flat();
    logger.info('%d Accounts found on the Organizations listed', flatAccounts.length);
    return flatAccounts;
  }

  filterAccountsList(orgsAccountsList: any[], config: any) {
    logger.info('%d Accounts found on the Organizations listed', orgsAccountsList.length);
    logger.info('Getting accounts from include/exclude lists..');
    logger.info('%d accounts found on include_list', config.accounts.include_list.length);
    logger.info('%d accounts found on exclude_list', config.accounts.exclude_list.length);
    const filteredAccountsList = config.accounts.include_list
      // concat include_list
      .concat(orgsAccountsList)
      // delete exclude_list
      .filter((xa: any) => !config.accounts.exclude_list.find((xi: any) => xi.Id === xa.Id))
      // merge with default settings
      .map((account: any) => deepmerge(config.defaults, account))
      // build assumeRoleArn string, extract account_id and revolver_role_name
      .map((account: any) => {
        account.settings.assumeRoleArn = `arn:aws:iam::${account.Id}:role/${account.settings.revolverRoleName}`;
        return account;
      });

    // remove duplicated accounts
    return uniqueBy(filteredAccountsList, (account: any) => JSON.stringify([account.Id, account.settings.region]));
  }
}
