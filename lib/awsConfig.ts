import environ from './environ';
// import { AwsCredentialIdentity as Credentials, Provider } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from './logger';
import assume from '../lib/assume';

// In version 3 , there is no longer a global configuration managed by the SDK
function getAwsConfig(credentials: any, region: string) {
  // credentials is  Credentials | Provider<Credentials> or undefined?
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
      base: environ.baseBackoff, // TODO: RetryStrategy see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/
    },
    maxAttempts: environ.maxRetries,
    requestHandler: requestHandler,
    // logger: logger,
  };
}

// Helper function to get local/remote credentials, then get the configuration for creating an API client
async function getAwsConfigViaRole(remoteRole: string, region: string) {
  const creds = await assume.connectTo(remoteRole, region);
  return getAwsConfig(creds, region);
}

async function getAwsClient(clientType: any, remoteRole: string, region: string) {
  const creds = await assume.connectTo(remoteRole, region);
  const config = getAwsConfig(creds, region);
  return new clientType(config);
}

export { getAwsConfig, getAwsConfigViaRole, getAwsClient };
