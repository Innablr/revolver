import environ from './environ';
import { AwsCredentialIdentity as Credentials, Provider } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import assume from '../lib/assume';

// In version 3 , there is no longer a global configuration managed by the SDK
function getAwsConfig(region?: string, credentials?: Credentials | Provider<Credentials>) {
  // returns:
  // - AwsAuthInputConfig (credentials)
  // - ClientDefaults (region, maxAttempts, retryMode, )
  // logger.info(`Set AWS SDK retry options to ${baseBackoff}ms base backoff, max retries ${maxRetries}`);
  let requestHandler = undefined;
  if (environ.httpsProxy) {
    // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-proxies.html
    const agent = new HttpsProxyAgent(environ.httpsProxy);
    requestHandler = new NodeHttpHandler({
      httpAgent: agent,
      httpsAgent: agent,
    });
  }
  return {
    credentials: credentials,
    region: region,
    retryDelayOptions: {
      base: environ.baseBackoff,
    },
    maxAttempts: environ.maxRetries,
    requestHandler: requestHandler,
    // logger: logger, // enable AWS query logging
  };
}

type Ctor<U> = new (stuff: object) => U;

// Helper function to get a specific AWS client for the given role/region
async function getAwsClient<T>(ctor: Ctor<T>, remoteRole: string, region: string): Promise<T> {
  const creds = await assume.connectTo(remoteRole);
  const config = getAwsConfig(region, creds);
  return new ctor(config);
}

// Helper function to get a specific AWS client for the given account
async function getAwsClientForAccount<T>(ctor: Ctor<T>, accountConfig: any): Promise<T> {
  return getAwsClient(ctor, accountConfig.assumeRoleArn, accountConfig.region);
}

export { getAwsConfig, getAwsClientForAccount };
