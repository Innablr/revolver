import { EventBridgeEvent, Context } from 'aws-lambda';
import { handler as revolverHandle } from './revolver.js';

const timeStamp = process.env.CURRENT_TIME || new Date().toISOString();

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

console.log(`Running revolver at timestamp [${timeStamp}]`);
const r = revolverHandle(event, context, () => {});
if (r instanceof Promise) {
  r.then(() => {
    console.log('Done');
  }).catch((e: Error) => {
    console.error(e);
    process.exit(1);
  });
}
