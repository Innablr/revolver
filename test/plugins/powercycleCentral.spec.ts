import { expect } from 'chai';
import path from 'node:path';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { handler as revolverHandle } from '../../revolver.js';
import environ from '../../lib/environ.js';
import * as fs from 'node:fs';
import { RevolverConfig } from '../../lib/config.js';
import { ObjectLogJson } from '../../lib/objectLog.js';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

// information from the config file to be used for validation
const LOCAL_CONFIG = path.join(__dirname, 'powercycleCentral.config.yaml');
const ACCOUNTS = [
  {
    accountId: '112233445566',
    name: 'whatdev',
  },
  {
    accountId: '888888888888',
    name: 'second',
  },
];

enum OutputFiles {
  Audit = 0,
  ResourcesCsv = 1,
  ResourcesJson = 2,
}

const configCopy = RevolverConfig.validateYamlConfig(fs.readFileSync(LOCAL_CONFIG, { encoding: 'utf8' }));

// Get the resolved name of an output file for (0-based) account and output-file-type
function getOutputFilename(accountNumber: number, which: OutputFiles): string {
  const writer = new ObjectLogJson([], {}, ACCOUNTS[accountNumber]);
  let path: string | undefined;
  if (which === OutputFiles.Audit) {
    path = configCopy.defaults.settings.auditLog?.csv?.file;
  } else if (which === OutputFiles.ResourcesCsv) {
    path = configCopy.defaults.settings.resourceLog?.csv?.file;
  } else if (which === OutputFiles.ResourcesJson) {
    path = configCopy.defaults.settings.resourceLog?.json?.file;
  } else {
    return '';
  }
  return writer.resolveFilename(path);
}

const timeStamp = '2024-02-22T23:45:19.521Z'; // Fri 10:45 +11,  Thu 23:45 +0

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

function unlinkIfExists(filename: string) {
  if (fs.existsSync(filename)) {
    fs.unlinkSync(filename);
  }
}

function clearFiles() {
  ACCOUNTS.forEach((_account, accountIndex) => {
    unlinkIfExists(getOutputFilename(accountIndex, OutputFiles.Audit));
    unlinkIfExists(getOutputFilename(accountIndex, OutputFiles.ResourcesCsv));
    unlinkIfExists(getOutputFilename(accountIndex, OutputFiles.ResourcesJson));
  });
}

describe('Run powercycleCentral full cycle', function () {
  beforeEach(() => {
    clearFiles();
    environ.configPath = LOCAL_CONFIG;
  });
  afterEach(clearFiles);

  it('resolves', (done) => {
    const r = revolverHandle(event, context, () => {});
    if (r instanceof Promise) {
      r.then(() => {
        // TODO: validate schedule matching resources
        // TODO: validate schedule matching resources, but overridden by resource Tags
        // TODO: validate schedule matching resources, but NOT overridden by resource Tags (lower priority)

        // validate audit.csv
        const a1_audit_file = getOutputFilename(0, OutputFiles.Audit);
        const a1_audit_text = fs.readFileSync(a1_audit_file, 'utf-8');
        expect((a1_audit_text.match(/2024-02-/g) || []).length).to.equal(3); // number of rows
        expect(a1_audit_text).to.include(',ec2,ec2,i-0c688d35209d7f436,stop,');
        expect(a1_audit_text).to.include(',ec2,ec2,i-031635db539857721,stop,');
        expect(a1_audit_text).to.include(',ec2,ec2,i-072b78745f1879e97,stop,');
        expect(a1_audit_text).to.not.include(',ec2,ec2,i-05b6baf37fc8f9454,stop,');

        const auditRecords = parse(a1_audit_text, { columns: true });
        expect(auditRecords.length).to.equal(3);
        expect(auditRecords[0].ID).equals('i-0c688d35209d7f436');
        expect(auditRecords[0].ACTION).equals('stop');
        expect(auditRecords[0].TYPE).equals('ec2');

        // TODO: validate resources.csv
        const a1_resourcecsv_file = getOutputFilename(0, OutputFiles.ResourcesCsv);
        const a1_resourcecsv_text = fs.readFileSync(a1_resourcecsv_file, 'utf-8');
        expect(a1_resourcecsv_text).to.include(',TAG:Name,TAG:Schedule');
        expect(a1_resourcecsv_text).to.include(
          'i-0c688d35209d7f436,running,Tag:Schedule (0x7),StopAction,junk-vm-2-on,0x7',
        );
        expect(a1_resourcecsv_text).to.not.include('777777777777,'); // don't include excluded account
        expect(a1_resourcecsv_text).to.not.include('888888888888,'); // under different filename
        expect(a1_resourcecsv_text).to.not.include(',i-B7781A749688DAD2,'); // under different filename

        // validate matches and actions in resources.json
        const a1_resourcejson_file = getOutputFilename(0, OutputFiles.ResourcesJson);
        const a1_resources = JSON.parse(fs.readFileSync(a1_resourcejson_file, 'utf-8'));
        const a1_resources_by_id = Object.fromEntries(a1_resources.map((r: any) => [r.resourceId, r]));
        expect(a1_resources.length).to.equal(10); // number of resources, in first account
        expect(a1_resources_by_id['i-0c688d35209d7f436'].resourceState).to.equal('running');
        expect(a1_resources_by_id['i-0c688d35209d7f436'].metadata.highestMatch).to.equal('Tag:Schedule (0x7)');
        expect(a1_resources_by_id['i-0c688d35209d7f436'].metadata.actionNames.length).to.equal(1);
        expect(a1_resources_by_id['i-0c688d35209d7f436'].metadata.actionNames[0]).to.equal('StopAction');
        expect(a1_resources_by_id['i-05b6baf37fc8f9454'].resourceState).to.equal('running');
        expect(a1_resources_by_id['i-05b6baf37fc8f9454'].metadata.highestMatch).to.equal(
          'first asg (Start=08:00|mon-fri;Stop=18:00|mon-fri)',
        );
        expect(a1_resources_by_id['i-05b6baf37fc8f9454'].metadata.actionNames).to.equal(undefined);

        // validate account 2 resources file
        const a2_resourcecsv_file = getOutputFilename(1, OutputFiles.ResourcesCsv);
        const a2_resourcecsv_text = fs.readFileSync(a2_resourcecsv_file, 'utf-8');
        expect(a2_resourcecsv_text.match(/\n/g)!.length).to.equal(3); // including heading
        expect(a2_resourcecsv_text).to.not.include('777777777777,'); // don't include excluded account
        expect(a2_resourcecsv_text).to.include('888888888888,');
        expect(a2_resourcecsv_text).to.include(',i-B7781A749688DAD2,');

        const a2_audit_file = getOutputFilename(1, OutputFiles.Audit);
        const a2_audit_text = fs.readFileSync(a2_audit_file, 'utf-8');
        expect(a2_audit_text.match(/\n/g)!.length).to.equal(2); // including heading
        expect(a2_audit_text).to.include('i-B7781A749688DAD2,stop'); // stopped because Thu 23:45 +0 is outside EarlyStartBusinessHours
      }).then(done, done);
    }
  });
});
