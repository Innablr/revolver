import environ from './environ';
import { ProxyAgent } from 'proxy-agent';
import { AwsCredentialIdentity as Credentials } from '@aws-sdk/types';

// In version 3 , there is no longer a global configuration managed by the SDK
// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-proxies.html
function getAwsConfig(credentials: Credentials, region: string) {
  // returns:
  // - AwsAuthInputConfig (credentials)
  // - ClientDefaults (region, maxAttempts, retryMode, )
  // logger.info(`Set AWS SDK retry options to ${baseBackoff}ms base backoff, max retries ${maxRetries}`);
  // TODO: combine fetching creds and applying defaults
  return {
    credentials: credentials,
    region: region,
    httpOptions: {
      agent: new ProxyAgent(),
    },
    retryDelayOptions: {
      base: environ.baseBackoff, // TODO: RetryStrategy see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/
    },
    maxAttempts: environ.maxRetries,
  };
}

export { getAwsConfig };
