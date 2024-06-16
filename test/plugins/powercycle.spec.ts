import { expect } from 'chai';
import { logger } from '../../lib/logger.js';
import path from 'path';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { handler as revolverHandle } from '../../revolver.js';
import environ from '../../lib/environ.js';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const LOCAL_CONFIG = path.join(__dirname, 'powercycle.config.yaml');
const OUTPUT_AUDIT_CSV_FILE = path.join(__dirname, 'audit.csv');
const OUTPUT_RESOURCES_CSV_FILE = path.join(__dirname, 'resources.csv');
const OUTPUT_RESOURCES_JSON_FILE = path.join(__dirname, 'resources.json');

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

function clearFiles() {
  if (fs.existsSync(OUTPUT_AUDIT_CSV_FILE)) fs.unlinkSync(OUTPUT_AUDIT_CSV_FILE);
  if (fs.existsSync(OUTPUT_RESOURCES_CSV_FILE)) fs.unlinkSync(OUTPUT_RESOURCES_CSV_FILE);
  if (fs.existsSync(OUTPUT_RESOURCES_JSON_FILE)) fs.unlinkSync(OUTPUT_RESOURCES_JSON_FILE);
}

describe('Run powercycle full cycle', function () {
  beforeEach(() => {
    clearFiles();
    environ.configPath = LOCAL_CONFIG;
  });
  afterEach(clearFiles);

  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then(() => {
        // validate audit.csv
        logger.info(`TEST validating ${OUTPUT_AUDIT_CSV_FILE}`);
        const auditCsvText = fs.readFileSync(OUTPUT_AUDIT_CSV_FILE, 'utf-8');
        // expect((auditCsvText.match(/2024-02-/g) || []).length).to.equal(4); // number of rows
        expect(auditCsvText).to.include('i-0c688d35209d7f436,stop,pretend,Availability 0x7');
        expect(auditCsvText).to.include('i-0c688d35209d7f436,setTag,pretend,ReasonSchedule:Availability 0x7');
        expect(auditCsvText).to.include('i-01531c2e601f21910,start,pretend,Availability 24x7');
        // expect(auditCsvText).to.not.include(',ec2,ec2,i-05b6baf37fc8f9454,stop,');

        // Parse the audit CSV back into records
        const records = parse(auditCsvText, { bom: true, columns: true });
        expect(records.length).to.equal(12);
        const recordsById = Object.assign({}, ...records.map((x: any) => ({ [x.ID]: x })));
        // Check one record (the RDS Cluster)
        const rdsClusterRecord = recordsById['revolver-test-rds-cluster'];
        expect(rdsClusterRecord.DRIVER).equals('rdsCluster');
        expect(rdsClusterRecord.PLUGIN).equals('powercycle');
        expect(rdsClusterRecord.STATUS).equals('pretend');
        expect(rdsClusterRecord.TYPE).equals('rds');
        const rdsClusterMeta = JSON.parse(rdsClusterRecord.METADATA);
        expect(rdsClusterMeta.members.length).equals(2);
        // Only tags in the includeResourceTags list should be included
        expect(rdsClusterMeta.tags.category).equals('workload');
        expect(rdsClusterMeta.tags.trustlevel).equals(undefined);

        // Check an EC2 record also
        const ec2Record = recordsById['i-01531c2e601f21910'];
        const ec2Meta = JSON.parse(ec2Record.METADATA);
        expect(ec2Meta.tags.category).equals('workload');
        expect(ec2Meta.tags.trustlevel).equals(undefined);

        // TODO: validate resources.csv
        // logger.info(`TEST validating ${OUTPUT_RESOURCES_CSV_FILE}`);
        // const resourcesCsvText = fs.readFileSync(OUTPUT_RESOURCES_CSV_FILE, 'utf-8');

        // validate matches and actions in resources.json
        // logger.info(`TEST validating ${OUTPUT_RESOURCES_JSON_FILE}`);
        // const rawData = fs.readFileSync(OUTPUT_RESOURCES_JSON_FILE, 'utf-8');
        // const resourceList = JSON.parse(rawData);
        // const resources = Object.fromEntries(resourceList.map((r: any) => [r.resourceId, r]));
        // expect(resourceList.length).to.equal(10); // number of resources

        // expect(resources['i-0c688d35209d7f436'].resourceState).to.equal('running');
        // expect(resources['i-0c688d35209d7f436'].metadata.matches.length).to.equal(1);
        // expect(resources['i-0c688d35209d7f436'].metadata.matches[0].name).to.equal('everything off (p1)');
        // expect(resources['i-0c688d35209d7f436'].metadata.actionNames.length).to.equal(1);
        // expect(resources['i-0c688d35209d7f436'].metadata.actionNames[0]).to.equal('StopAction');

        // expect(resources['i-05b6baf37fc8f9454'].resourceState).to.equal('running');
        // expect(resources['i-05b6baf37fc8f9454'].metadata.matches.length).to.equal(2);
        // expect(resources['i-05b6baf37fc8f9454'].metadata.actionNames).to.equal(undefined);
      }).then(done, done);
    }
  });
});
