import { expect } from 'chai';
import { logger } from '../../lib/logger';
import path from 'path';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { handler as revolverHandle } from '../../revolver';
import environ from '../../lib/environ';
import * as fs from 'fs';

const LOCAL_CONFIG = path.join(__dirname, 'test-revolver-config.powercycleCentral.yaml');
// const RESOURCES_FILE = path.join(__dirname, 'resources.json'); // in config YAML
const OUTPUT_AUDIT_CSV_FILE = path.join(__dirname, 'audit.csv');
const OUTPUT_RESOURCES_CSV_FILE = path.join(__dirname, 'resources.csv');
const OUTPUT_RESOURCES_JSON_FILE = path.join(__dirname, 'resources.json');

describe('XXX Run full cycle', function () {
  // const timeStamp = process.env['CURRENT_TIME'] || new Date().toISOString();
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

  environ.configPath = LOCAL_CONFIG;
  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then((result) => {
        // TODO: validate audit.csv

        // TODO: validate resources.csv

        // TODO: validate matches and actions in resources.json
        logger.info(`TEST validating ${OUTPUT_RESOURCES_JSON_FILE}`);
        const rawData = fs.readFileSync(OUTPUT_RESOURCES_JSON_FILE, 'utf-8');
        const resourceList = JSON.parse(rawData);
        const resources = resourceList.reduce(
          (lookup: any, resource: { resourceId: any }) => ({
            ...lookup,
            [resource.resourceId]: resource,
          }),
          {},
        );
        expect(resourceList.length).to.equal(10);

        expect(resources['i-0c688d35209d7f436'].resourceState).to.equal('running');
        expect(resources['i-0c688d35209d7f436'].metadata.matches.length).to.equal(1);
        expect(resources['i-0c688d35209d7f436'].metadata.matches[0].name).to.equal('everything off (p1)');
        expect(resources['i-0c688d35209d7f436'].metadata.actionNames.length).to.equal(1);
        expect(resources['i-0c688d35209d7f436'].metadata.actionNames[0]).to.equal('StopAction');

        expect(resources['i-05b6baf37fc8f9454'].resourceState).to.equal('running');
        expect(resources['i-05b6baf37fc8f9454'].metadata.matches.length).to.equal(2);
        expect(resources['i-05b6baf37fc8f9454'].metadata.actionNames).to.equal(undefined);
      }).then(done, done);
    }
  });
});
