import environ from './environ.js';
import { AwsCredentialIdentity as Credentials, Provider } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import assume from '../lib/assume.js';

// In version 3 , there is no longer a global configuration managed by the SDK
function getAwsConfig(region?: string, credentials?: Credentials | Provider<Credentials>) {
  // returns:
  // - AwsAuthInputConfig (credentials)
  // - ClientDefaults (region, maxAttempts, retryMode, )

  // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-proxies.html
  const agent = environ.httpsProxy ? new HttpsProxyAgent(environ.httpsProxy) : undefined;
  const requestHandler = new NodeHttpHandler({
    httpAgent: agent,
    httpsAgent: agent,
    // The maximum time in milliseconds that the connection phase of a request may take before the connection
    // attempt is abandoned. Defaults to 0, which disables the timeout.
    connectionTimeout: environ.connectionTimeout,
    // The number of milliseconds a request can take before automatically being terminated. Defaults to 0,
    // which disables the timeout.
    requestTimeout: environ.requestTimeout,
  });
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
