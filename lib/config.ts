import { logger } from './logger';
import { promises as fs } from 'fs';
import path = require('node:path');
import yaml from 'js-yaml';
import { Organizations, paginateListAccounts } from '@aws-sdk/client-organizations';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { paginateAwsCall } from './common';
import { merge } from 'ts-deepmerge';
import { getAwsConfig } from './awsConfig';
import { ConfigSchema } from './config-schema';
import { ZodError, ZodIssueCode, ZodInvalidUnionIssue, ZodInvalidArgumentsIssue, ZodInvalidReturnTypeIssue } from 'zod';

function flattenZodErrors(ze: ZodError, depth: number): string[] {
  let lines: string[] = [];
  for (const zi of ze.errors) {
    const code = zi.code;
    const path = zi.path.join('.');
    const msg = zi.message;

    lines.push(`${path} [${code}]: ${msg}`);

    switch (zi.code) {
      case ZodIssueCode.invalid_union:
        lines = lines.concat(
          (zi as ZodInvalidUnionIssue).unionErrors
            .map((e) => flattenZodErrors(e, depth + 1))
            .reduce((a, s) => a.concat(s), []),
        );
        break;
      case ZodIssueCode.invalid_arguments:
        lines = lines.concat(flattenZodErrors((zi as ZodInvalidArgumentsIssue).argumentsError, depth + 1));
        break;
      case ZodIssueCode.invalid_return_type:
        lines = lines.concat(flattenZodErrors((zi as ZodInvalidReturnTypeIssue).returnTypeError, depth + 1));
        break;
    }
  }
  return lines;
}

export class RevolverConfig {
  static validateConfig(data: string) {
    try {
      const config = ConfigSchema.parse(yaml.load(data));
      logger.trace('Read Revolver config', config);
      return config;
    } catch (e: any) {
      if (e instanceof ZodError) {
        const ze = e as ZodError;
        throw new Error(`ZodError: Failed to parse\n\t${flattenZodErrors(ze, 0).join('\n\t')}`);
      } else {
        throw new Error(e);
      }
    }
  }

  static async readConfigFromFile(configFile: string) {
    const fullPath = path.resolve(configFile);
    logger.debug(`Fetching config from file ${fullPath}`);
    return RevolverConfig.validateConfig(await fs.readFile(fullPath, { encoding: 'utf8' }));
  }

  static async readConfigFromS3(configBucket: string, configKey: string) {
    const config = getAwsConfig();
    const s3 = new S3Client(config);
    logger.debug(`Fetching config from bucket [${configBucket}] key [${configKey}]`);

    const configObject = await s3.send(new GetObjectCommand({ Bucket: configBucket, Key: configKey }));
    logger.debug(`Found S3 object MIME ${configObject.ContentType}`);
    return RevolverConfig.validateConfig(await configObject.Body!.transformToString());
  }

  static async getOrganisationsAccounts(creds: any[]) {
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

  static filterAccountsList(orgsAccountsList: any[], config: any) {
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
    // exclude accounts specified in excludeList, and non-active accounts
    const filteredAccountsList = accountList.filter(
      (xa: any) => xa.Status == 'ACTIVE' && !config.accounts.excludeList.find((xi: any) => xi.accountId === xa.accountId),
    );
    // build assumeRoleArn string, extract account_id and revolver_role_name
    const updatedAccountsList = filteredAccountsList.map((xa: any) => {
      const account: any = merge.withOptions({ mergeArrays: false }, config.defaults, xa);
      account.settings.assumeRoleArn = `arn:aws:iam::${account.accountId}:role/${account.settings.revolverRoleName}`;
      return account;
    });

    return updatedAccountsList;
  }
}
