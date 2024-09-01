import { expect } from 'chai';
import { getAwsClientForAccount, getAwsConfig } from '../../lib/awsConfig.js';
import { EC2Client } from '@aws-sdk/client-ec2';
import sinon from 'sinon'; // Import the 'sinon' library
import assume from '../../lib/assume.js';
import { AwsCredentialIdentity as Credentials, Provider } from '@aws-sdk/types';

describe('Validate auditLog', function () {
  // check getAwsConfig
  const config = getAwsConfig('ap-southeast-2', { accessKeyId: 'blah', secretAccessKey: 'blah' });
  expect(config).to.be.an('object');
  expect(config.region).to.equal('ap-southeast-2');

  it('Check ObjectLogCsv audit', async function () {
    // check getAwsClientForAccount
    const fakeCreds: Credentials = { accessKeyId: 'blah', secretAccessKey: 'blah' };
    const stub = sinon.stub(assume, 'connectTo').resolves(fakeCreds);
    const client = await getAwsClientForAccount(EC2Client, {
      assumeRoleArn: 'arn:aws:iam::123456789012:role/blah',
      region: 'ap-southeast-2',
    });
    expect(stub.calledOnce).to.be.true;
    expect(client).to.be.an('object');
    expect(client).to.be.instanceOf(EC2Client);
  });
});
