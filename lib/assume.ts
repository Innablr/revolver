import { logger } from './logger';
import { STS, STSClientConfig } from '@aws-sdk/client-sts';
import dateTime from './dateTime';
import { DateTime } from 'luxon';
import { AwsCredentialIdentity as Credentials, Provider } from '@aws-sdk/types';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { getAwsConfig } from './awsConfig';

export interface Creds {
  expiration: DateTime;
  creds: Credentials;
}

class RemoteCredentials {
  private creds: { [key: string]: Creds };

  constructor() {
    this.creds = {};
  }

  accountId(remoteRole: string) {
    const m = remoteRole.match(/arn:aws:iam:.*:([0-9]{12}):role\/(.+)/);
    if (!m) {
      throw new Error(`Invalid remote role: ${remoteRole}`);
    }
    const [, accountId] = m;
    return accountId;
  }

  async connectTo(remoteRole: string, region?: string): Promise<Credentials | Provider<Credentials>> {
    logger.debug(`Requested connection via ${remoteRole}`);
    if (remoteRole === undefined || remoteRole.endsWith('/none')) {
      return fromNodeProviderChain();
    }

    if (remoteRole in this.creds) {
      if (this.creds[remoteRole].expiration > DateTime.now().setZone('UTC')) {
        logger.debug(`Role ${remoteRole} is cached, will expire at ${this.creds[remoteRole].expiration}`);
        return this.creds[remoteRole].creds;
      }
      logger.debug(
        `Cached role ${remoteRole} expired at ${this.creds[remoteRole].expiration}, requesting new creds...`,
      );
    }

    logger.debug(`Assuming role ${remoteRole}...`);
    const awsConfig = getAwsConfig(region || 'ap-southeast-2');
    const sts = new STS(awsConfig);
    const creds = await sts
      .assumeRole({
        RoleArn: remoteRole,
        RoleSessionName: `Revolver_${dateTime.getTime().toFormat('yyyyLLddHHmmss')}`,
      })
      .then((r) => r.Credentials);

    if (!creds) {
      throw new Error(`Unable to assume role ${remoteRole}, got empty creds`);
    }
    if (creds.Expiration === undefined) {
      throw new Error(`Credentials have no expiry time`);
    }
    const expireAt = DateTime.fromJSDate(creds.Expiration).setZone('UTC').minus({ seconds: 5 });
    // TODO: deal with undefined better
    const tokenCreds: Credentials = {
      accessKeyId: creds.AccessKeyId || 'Missing AccessKeyId',
      secretAccessKey: creds.SecretAccessKey || 'Missing SecretAccessKey',
      sessionToken: creds.SessionToken,
    };

    logger.debug(`Assumed role ${remoteRole} will expire at ${expireAt} plus 5 seconds, caching...`);

    this.creds[remoteRole] = {
      expiration: expireAt,
      creds: tokenCreds,
    };

    return this.creds[remoteRole].creds;
  }
}

const remoteCredentials = new RemoteCredentials();
export default remoteCredentials;
