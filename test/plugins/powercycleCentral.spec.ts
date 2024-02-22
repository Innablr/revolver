import { expect } from 'chai';
import { RevolverConfig } from '../../lib/config';
import { logger } from '../../lib/logger';
import path from 'path';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { handler as revolverHandle } from '../../revolver';
import environ from '../../lib/environ';

const LOCAL_CONFIG = path.join(__dirname, 'test-revolver-config.powercycleCentral.yaml');
// const RESOURCES_FILE = path.join(__dirname, 'resources.json'); // in config YAML


describe('XXX Run full cycle', function () {
  // const timeStamp = process.env['CURRENT_TIME'] || new Date().toISOString();
  const timeStamp = "2024-02-22T12:45:19.521Z"

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

  environ.configPath = LOCAL_CONFIG;
  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then((result) => {
        // TODO: validate audit.csv

        // TODO: validate resources.csv

        // TODO: validate resources.json?
      }).then(done, done);
    }
  });
});
