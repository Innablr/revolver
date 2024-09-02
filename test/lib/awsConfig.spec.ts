import { expect } from 'chai';
import { getAwsClientForAccount, getAwsConfig } from '../../lib/awsConfig.js';
import { EC2Client } from '@aws-sdk/client-ec2';
import sinon from 'sinon';
import { STS } from '@aws-sdk/client-sts';
import environ from '../../lib/environ.js';

describe('Validate getAwsConfig', function () {
  // check getAwsConfig
  const config = getAwsConfig('ap-southeast-2', { accessKeyId: 'blah', secretAccessKey: 'blah' });
  expect(config).to.be.an('object');
  expect(config.region).to.equal('ap-southeast-2');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  it('Check getAwsClientForAccount', async function () {
    // stub STS.assumeRole
    environ.httpsProxy = 'https://localhost:1234';
    const stsAssumeRoleStub = sinon
      .stub(STS.prototype, 'assumeRole')
      .resolves({ Credentials: { accessKeyId: 'blah', Expiration: tomorrow } });

    // check getAwsClientForAccount (fresh)
    const client = await getAwsClientForAccount(EC2Client, {
      assumeRoleArn: 'arn:aws:iam::123456789012:role/blah',
      region: 'ap-southeast-2',
    });
    expect(stsAssumeRoleStub.calledOnce).to.be.true;
    expect(client).to.be.instanceOf(EC2Client);

    // check getAwsClientForAccount (cache)
    const client2 = await getAwsClientForAccount(EC2Client, {
      assumeRoleArn: 'arn:aws:iam::123456789012:role/blah',
      region: 'ap-southeast-2',
    });
    expect(stsAssumeRoleStub.calledOnce).to.be.true; // no further call (cache)
    expect(client2).to.be.instanceOf(EC2Client); // still

    stsAssumeRoleStub.restore(); // should be finally
  });
});
