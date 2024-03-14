import path from 'path';
import { handler as revolverHandle } from '../../revolver';
import environ from '../../lib/environ';
import { Context, EventBridgeEvent } from 'aws-lambda';

const LOCAL_CONFIG = path.join(__dirname, 'powercycleOrg.config.yaml');
// const OUTPUT_RESOURCES_JSON_FILE = path.join(__dirname, 'resources.json');

const timeStamp = '2024-02-22T23:45:19.521Z';

const event: EventBridgeEvent<'Scheduled Event', 'test-event'> = {
  id: '0',
  'detail-type': 'Scheduled Event',
  version: '0',
  account: '0',
  time: timeStamp,
  region: 'ap-southeast-2',
  source: 'revolver',
  resources: [],
  detail: 'test-event',
};

const context: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'revolver',
  functionVersion: '0',
  invokedFunctionArn: 'arn:aws:lambda:ap-southeast-2:0:function:revolver',
  memoryLimitInMB: '512',
  awsRequestId: '0',
  logGroupName: 'revolver',
  logStreamName: '0',
  getRemainingTimeInMillis: () => 0,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('Run powercycle full cycle using org', function () {
  beforeEach(function () {
    environ.configPath = LOCAL_CONFIG;
  });

  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then(() => {
        // TODO: how to validate org file loaded properly?
        // Log line: Revolver will run on 2 account(s): sample-account-2(665544332211),whatdev(112233445566)
      }).then(done, done);
    }
  });
});
