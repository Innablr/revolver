import { logger } from './logger';
import { Credentials } from 'aws-sdk';
import { STS } from '@aws-sdk/client-sts';
import dateTime from './dateTime';
import { DateTime } from 'luxon';
import { config as awsConfig } from 'aws-sdk';

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

  async connectLocal(): Promise<Credentials> {
    const creds = await new Promise((resolve, reject) => {
      logger.debug('Skipping assume role since role name is "none". Using locally configured credentials');
      awsConfig.getCredentials((err, creds) => {
        if (err !== undefined) {
          reject(err);
        } else {
          resolve(creds);
        }
      });
    });

    return creds as Credentials;
  }

  async connectTo(remoteRole: string): Promise<Credentials> {
    const sts = new STS();

    logger.debug(`Requested connection via ${remoteRole}`);

    if (remoteRole === undefined || remoteRole.endsWith('/none')) {
      return this.connectLocal();
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
    const creds = await sts
      .assumeRole({
        RoleArn: remoteRole,
        RoleSessionName: `Revolver_${dateTime.getTime().toFormat('yyyyLLddHHmmss')}`,
      })
      .then((r) => r.Credentials);

    if (!creds) {
      throw new Error(`Unable to assume role ${remoteRole}, got empty creds`);
    }

    const expireAt = DateTime.fromJSDate(creds.Expiration).setZone('UTC').minus({ seconds: 5 });
    const tokenCreds = new Credentials({
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    });

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
