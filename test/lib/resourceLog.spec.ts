import { expect } from 'chai';
import { ObjectLogHtml, ObjectLogTable, ObjectLogCsv, ObjectLogJson, ResourceTable } from '../../lib/objectLog';
import { ToolingInterface } from '../../drivers/instrumentedResource';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import dateTime from '../../lib/dateTime';

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
    return 'arn:aws:ec2:ap-southeast-2:112233445566:volume/' + randomBytes(20).toString('hex');
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
  const writer = new ObjectLogJson([], {}, { name: 'NAME', accountId: '123' });
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
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      RESOURCE_LOG_CONFIG.csv,
      ACCOUNT_CONFIG.settings,
    ).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.csv.file
    const resourceCsvText = fs.readFileSync(RESOURCE_LOG_CONFIG.csv.file, 'utf-8');
    expect((resourceCsvText.match(/DoThis\|DoThat/g) || []).length).to.equal(4); // number of rows
  });

  it('Check ObjectLogJson', async function () {
    if (fs.existsSync(RESOURCE_LOG_CONFIG.json.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.json.file);
    await new ObjectLogJson(TEST_RESOURCES, RESOURCE_LOG_CONFIG.json, ACCOUNT_CONFIG.settings).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.json.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.json.file
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
});
