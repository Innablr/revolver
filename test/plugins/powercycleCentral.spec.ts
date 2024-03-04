import { expect } from 'chai';
import { logger } from '../../lib/logger';
import path from 'path';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { handler as revolverHandle } from '../../revolver';
import environ from '../../lib/environ';
import * as fs from 'fs';

const LOCAL_CONFIG = path.join(__dirname, 'powercycleCentral.config.yaml');
const OUTPUT_AUDIT_CSV_FILE = path.join(__dirname, 'audit.csv');
const OUTPUT_RESOURCES_CSV_FILE = path.join(__dirname, 'resources.whatdev.112233445566.csv');
const OUTPUT_RESOURCES_888_CSV_FILE = path.join(__dirname, 'resources.second.888888888888.csv');
const OUTPUT_RESOURCES_JSON_FILE = path.join(__dirname, 'resources.whatdev.112233445566.json'); // resources.%name.%accountId.json

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

describe('Run powercycleCentral full cycle', function () {
  beforeEach(function () {
    // delete output files before run
    if (fs.existsSync(OUTPUT_AUDIT_CSV_FILE)) fs.unlinkSync(OUTPUT_AUDIT_CSV_FILE);
    if (fs.existsSync(OUTPUT_RESOURCES_JSON_FILE)) fs.unlinkSync(OUTPUT_RESOURCES_JSON_FILE);
    if (fs.existsSync(OUTPUT_RESOURCES_888_CSV_FILE)) fs.unlinkSync(OUTPUT_RESOURCES_888_CSV_FILE);
    environ.configPath = LOCAL_CONFIG;
  });

  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then(() => {
        // TODO: validate schedule matching resources
        // TODO: validate schedule matching resources, but overridden by resource Tags
        // TODO: validate schedule matching resources, but NOT overridden by resource Tags (lower priority)

        // validate audit.csv
        logger.info(`TEST validating ${OUTPUT_AUDIT_CSV_FILE}`);
        const auditCsvText = fs.readFileSync(OUTPUT_AUDIT_CSV_FILE, 'utf-8');
        expect((auditCsvText.match(/2024-02-/g) || []).length).to.equal(3); // number of rows
        expect(auditCsvText).to.include(',ec2,ec2,i-0c688d35209d7f436,stop,');
        expect(auditCsvText).to.include(',ec2,ec2,i-031635db539857721,stop,');
        expect(auditCsvText).to.include(',ec2,ec2,i-072b78745f1879e97,stop,');
        expect(auditCsvText).to.not.include(',ec2,ec2,i-05b6baf37fc8f9454,stop,');

        // TODO: validate resources.csv
        logger.info(`TEST validating ${OUTPUT_RESOURCES_CSV_FILE}`);
        const resourcesCsvText = fs.readFileSync(OUTPUT_RESOURCES_CSV_FILE, 'utf-8');
        expect(resourcesCsvText).to.include(',TAG:Name,TAG:Schedule');
        expect(resourcesCsvText).to.include('i-0c688d35209d7f436,running,StopAction,junk-vm-2-on,0x7');
        expect(resourcesCsvText).to.not.include('777777777777,'); // don't include excluded account
        expect(resourcesCsvText).to.not.include('888888888888,'); // under different filename
        expect(resourcesCsvText).to.not.include(',i-B7781A749688DAD2,'); // under different filename

        logger.info(`TEST validating ${OUTPUT_RESOURCES_888_CSV_FILE}`);
        const resources888CsvText = fs.readFileSync(OUTPUT_RESOURCES_888_CSV_FILE, 'utf-8');
        expect(resources888CsvText).to.not.include('777777777777,'); // don't include excluded account
        expect(resources888CsvText).to.include('888888888888,');
        expect(resources888CsvText).to.include(',i-B7781A749688DAD2,');

        // validate matches and actions in resources.json
        logger.info(`TEST validating ${OUTPUT_RESOURCES_JSON_FILE}`);
        const rawData = fs.readFileSync(OUTPUT_RESOURCES_JSON_FILE, 'utf-8');
        const resourceList = JSON.parse(rawData);
        const resources = Object.fromEntries(resourceList.map((r: any) => [r.resourceId, r]));
        expect(resourceList.length).to.equal(10); // number of resources, in first account

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
