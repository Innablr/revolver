import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { expect } from 'chai';
import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import sinon from 'sinon';
import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import dateTime from '../../lib/dateTime.js';
import { ObjectLogCsv, ObjectLogHtml, ObjectLogJson, ObjectLogTable, ResourceTable } from '../../lib/objectLog.js';

// A dummy AWS resource for testing
class FakeResource extends ToolingInterface {
  private myResourceId: string;
  private myResourceType: string;
  private myResourceState: string;
  constructor(resourceId: string, resourceType: string, resourceState: string, resource: any) {
    super(resource);
    this.myResourceId = resourceId;
    this.myResourceType = resourceType;
    this.myResourceState = resourceState;
    this.metadata.actionNames = ['DoThis', 'DoThat']; // pretend these are actually run
  }

  get resourceId(): string {
    return this.myResourceId;
  }
  get resourceType(): string {
    return this.myResourceType;
  }
  get resourceArn(): string {
    return `arn:aws:ec2:ap-southeast-2:112233445566:volume/${randomBytes(20).toString('hex')}`;
  }
  get launchTimeUtc(): DateTime<boolean> {
    return DateTime.fromISO('2024-02-13T22:43:49.000Z').setZone('utc');
  }
  get resourceState(): string {
    return this.myResourceState;
  }
  tag(key: string): string | undefined {
    return `value:${key}`;
  }
  get resourceTags(): { [key: string]: string } {
    return {};
  }
}

const RESOURCE_LOG_CONFIG = {
  json: {
    file: 'resourcelog-out.json',
    sns: {
      url: 'arn:aws:sns:ap-southeast-2:333333333333:revolver-nonprod-audit-topic',
      compress: false,
    },
    sqs: {
      url: 'https://sqs.ap-southeast-2.amazonaws.com/123456789012/sqs-queue',
      compress: false,
    },
  },
  html: {
    file: 'resourcelog-out.html',
  },
  csv: {
    file: 'resourcelog-out.csv',
    reportTags: ['F1', 'F2'],
  },
  console: {
    reportTags: ['F1', 'F2'],
  },
};

const TEST_RESOURCES = [
  new FakeResource('donkey1', 'donkey', 'running', { colour: 'gray' }),
  new FakeResource('shrek', 'ogre', 'running', { colour: 'green' }),
  new FakeResource('fiona', 'ogre', 'running', { colour: 'green' }),
  new FakeResource('lord-farquaad', 'baddie', 'dead', { colour: 'red' }),
];

const ACCOUNT_CONFIG = {
  settings: {
    name: 'dummyaccount',
  },
};

describe('Validate filename tokens', function () {
  const writer = new ObjectLogJson([], {}, { name: 'NAME', accountId: '123', timezone: 'Australia/Melbourne' });
  const timeStamp = '2024-02-19T04:40:44.526Z';
  dateTime.freezeTime(timeStamp);

  expect(writer.resolveFilename(undefined)).to.equal('');

  // Date/time tokens
  expect(writer.resolveFilename('file.txt')).to.equal('file.txt');
  expect(writer.resolveFilename('file.%c.txt')).to.equal('file.1.txt'); // day of week
  expect(writer.resolveFilename('file.%cccc.txt')).to.equal('file.Monday.txt');
  expect(writer.resolveFilename('file.%LLLL.txt')).to.equal('file.February.txt');
  expect(writer.resolveFilename('file.%yyyy%LL%dd.txt')).to.equal('file.20240219.txt');
  expect(writer.resolveFilename('file.%c%L.txt')).to.equal('file.12.txt'); // day of week, month
  expect(writer.resolveFilename('file.%HH%mm.txt')).to.equal('file.1540.txt'); // hours:minutes (in Australia timezone!)

  // Context tokens
  expect(writer.resolveFilename('file.%name.%accountId.txt')).to.equal('file.NAME.123.txt');

  // Invalid date/time tokens (not repeating, followed by non-word)
  expect(writer.resolveFilename('file.%cL.txt')).to.equal('file.%cL.txt');

  // No context
  const writerNoContext = new ObjectLogJson([], {});
  expect(writerNoContext.resolveFilename('file.%cccc.txt')).to.equal('file.Monday.txt');
  expect(writerNoContext.resolveFilename('file.%zzz.txt')).to.equal('file.zzz.txt');

  // Missing context
  const writerDifferentContext = new ObjectLogJson([], {}, { region: 'THERE' });
  expect(writerDifferentContext.resolveFilename('file.%name.txt')).to.equal('file.%name.txt'); //
});

describe('Validate ResourceLog', function () {
  it('Check ObjectLogConsole', async function () {
    await new ObjectLogTable(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      { console: null },
      'My Fake Resources',
      ACCOUNT_CONFIG.settings,
    ).process();
    // TODO: check the contents of console output
  });

  it('Check ObjectLogCsv resources', async function () {
    if (fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.csv.file);
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags, { SPAM: '123' }),
      RESOURCE_LOG_CONFIG.csv,
      ACCOUNT_CONFIG.settings,
    ).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)).to.be.true;
    // Check the contents of RESOURCE_LOG_CONFIG.csv.file
    const auditCsvText = fs.readFileSync(RESOURCE_LOG_CONFIG.csv.file, 'utf-8');
    const records = parse(auditCsvText, { bom: true, columns: true });
    expect(records.length).to.equal(4);
    expect(records[0].SPAM).to.equal('123');
    expect(records[0].ID).to.equal('donkey1');
    expect(records[0].TYPE).to.equal('donkey');
    expect(records[0].STATE).to.equal('running');
    // Check CSV append
    const newConfig = Object.assign({}, RESOURCE_LOG_CONFIG.csv, { append: true });
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, newConfig.reportTags, { SPAM: '123' }),
      newConfig,
      ACCOUNT_CONFIG.settings,
    ).process();
    const auditCsvText2 = fs.readFileSync(newConfig.file, 'utf-8');
    const records2 = parse(auditCsvText2, { bom: true, columns: true });
    expect(records2.length).to.equal(8);
  });

  it('Check ObjectLogJson', async function () {
    // Write some known content to the output file before starting
    const originalContent = 'test-content';
    fs.writeFileSync(RESOURCE_LOG_CONFIG.json.file, originalContent);

    // Stub out the SNS send method
    const snsSendStub = sinon.stub(SNSClient.prototype, 'send').resolves({ Something: 123 });
    const sqsSendStub = sinon.stub(SQSClient.prototype, 'send').resolves({ Another: 456 });

    // Execute the ObjectLogJson process (overwrite=false)
    await new ObjectLogJson(
      TEST_RESOURCES,
      { ...RESOURCE_LOG_CONFIG.json, overwrite: false },
      ACCOUNT_CONFIG.settings,
    ).process();
    const contents = fs.readFileSync(RESOURCE_LOG_CONFIG.json.file).toString('utf-8');
    expect(contents).to.equal(originalContent);

    // Check SNS.send was called once with correct arguments
    expect(snsSendStub.callCount).to.equal(1);
    expect(snsSendStub.getCall(0).args.length).to.equal(1);
    expect(snsSendStub.getCall(0).args[0]).to.be.instanceOf(PublishCommand);
    const snsCallArg: any = snsSendStub.getCall(0).args[0];
    expect(snsCallArg.input.TopicArn).to.equal(RESOURCE_LOG_CONFIG.json.sns.url);
    const snsCallMessage = JSON.parse(snsCallArg.input.Message!);
    expect(snsCallMessage.length).to.equal(4); // donkey1, shrek, fiona, lord-farquaad
    expect(snsCallMessage[0].resourceId).to.equal('donkey1');
    expect(snsCallMessage[1].resourceId).to.equal('shrek');

    // Check SQS.send was called once with correct arguments
    expect(sqsSendStub.callCount).to.equal(1);
    expect(sqsSendStub.getCall(0).args.length).to.equal(1);
    expect(sqsSendStub.getCall(0).args[0]).to.be.instanceOf(SendMessageCommand);
    const sqsCallArg: any = sqsSendStub.getCall(0).args[0];
    expect(sqsCallArg.input.QueueUrl).to.equal(RESOURCE_LOG_CONFIG.json.sqs.url);
    const sqsCallMessage = JSON.parse(sqsCallArg.input.MessageBody!);
    expect(sqsCallMessage.length).to.equal(4); // donkey1, shrek, fiona, lord-farquaad
    expect(sqsCallMessage[0].resourceId).to.equal('donkey1');
    expect(sqsCallMessage[1].resourceId).to.equal('shrek');

    if (fs.existsSync(RESOURCE_LOG_CONFIG.json.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.json.file);
    await new ObjectLogJson(TEST_RESOURCES, RESOURCE_LOG_CONFIG.json, ACCOUNT_CONFIG.settings).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.json.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.json.file
    const contents2 = fs.readFileSync(RESOURCE_LOG_CONFIG.json.file).toString('utf-8');
    expect(contents2).to.not.equal(originalContent);

    snsSendStub.restore(); // should be finally
    sqsSendStub.restore(); // should be finally
  });

  it('Check ObjectLogHtml', async function () {
    if (fs.existsSync(RESOURCE_LOG_CONFIG.html.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.html.file);
    await new ObjectLogHtml(TEST_RESOURCES, 'Object Log Test', RESOURCE_LOG_CONFIG.html).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.html.file)).to.be.true;

    const contents = fs.readFileSync(RESOURCE_LOG_CONFIG.html.file).toString('utf-8');

    expect(contents).to.contain('<html');
    for (const t of TEST_RESOURCES) {
      expect(contents).to.contain(t.resourceId);
    }
  });

  it('Check ObjectLogCsv overwrite', async function () {
    // Write some known content to the output file before starting
    const originalContent = 'test-content';
    fs.writeFileSync(RESOURCE_LOG_CONFIG.csv.file, originalContent);

    // Execute the ObjectLogCsv process (overwrite=false)
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags, { SPAM: '123' }),
      { ...RESOURCE_LOG_CONFIG.csv, overwrite: false },
      ACCOUNT_CONFIG.settings,
    ).process();

    // Check original content is intact
    const contents = fs.readFileSync(RESOURCE_LOG_CONFIG.csv.file).toString('utf-8');
    expect(contents).to.equal(originalContent);

    // Execute the ObjectLogCsv process (overwrite=undefined)
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags, { SPAM: '123' }),
      RESOURCE_LOG_CONFIG.csv,
      ACCOUNT_CONFIG.settings,
    ).process();

    // Check original content is gone
    const contents2 = fs.readFileSync(RESOURCE_LOG_CONFIG.csv.file).toString('utf-8');
    expect(contents2).to.not.equal(originalContent);
  });
});
