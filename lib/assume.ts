import { logger } from './logger';
import { STS, Credentials } from 'aws-sdk';
import dateTime from './dateTime';
import { utc } from 'moment-timezone';

export interface Creds {
  expiration: moment.Moment;
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

  async connectTo(remoteRole: string) {
    const sts = new STS();

    logger.debug('Requested connection via [%s]', remoteRole);

    if (remoteRole in this.creds) {
      if (this.creds[remoteRole].expiration > utc()) {
        logger.debug(
          'Role [%s] is cached, returning access key [%s], expire at [%s]',
          remoteRole,
          this.creds[remoteRole].creds.accessKeyId,
          this.creds[remoteRole].expiration,
        );
        return Promise.resolve(this.creds[remoteRole].creds);
      }
      logger.debug(
        'Cached role [%s] expired at [%s], requesting new creds...',
        remoteRole,
        this.creds[remoteRole].expiration,
      );
    }

    logger.debug('Assuming role [%s]...', remoteRole);
    const r = await sts
      .assumeRole({
        RoleArn: remoteRole,
        RoleSessionName: `Revolver_${dateTime.getTime().format('YYYYMMDDHHmmss')}`,
      })
      .promise();

    if (!r.Credentials) {
      throw new Error(`No credentials returned from STS for role: ${remoteRole}`);
    }

    const expireAt = utc(r.Credentials.Expiration).subtract(5, 'seconds');
    const tokenCreds = new Credentials({
      accessKeyId: r.Credentials.AccessKeyId,
      secretAccessKey: r.Credentials.SecretAccessKey,
      sessionToken: r.Credentials.SessionToken,
    });

    logger.debug('Assumed role [%s] will expire at [%s] plus 5 seconds.', remoteRole, expireAt);

    this.creds[remoteRole] = {
      expiration: expireAt,
      creds: tokenCreds,
    };

    logger.debug('Caching role [%s] with access key [%s]', remoteRole, this.creds[remoteRole].creds.accessKeyId);

    return this.creds[remoteRole].creds;
  }
}

const remoteCredentials = new RemoteCredentials();
export default remoteCredentials;
