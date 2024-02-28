import { expect } from 'chai';
import { ObjectLogTable, ObjectLogCsv, ObjectLogJson, ResourceTable } from '../../lib/objectLog';
import { ToolingInterface } from '../../drivers/instrumentedResource';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';

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
  template: {
    file: 'resourcelog-out.template.html',
    templateName: 'template1.njk',
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

describe('Validate ResourceLog', function () {
  it('Check ObjectLogConsole', async function () {
    await new ObjectLogTable(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      { console: null },
      'My Fake Resources',
    ).process();
    // TODO: check the contents of console output
  });

  it('Check ObjectLogCsv resources', async function () {
    if (fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.csv.file);
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      RESOURCE_LOG_CONFIG.csv,
    ).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.csv.file
    const resourceCsvText = fs.readFileSync(RESOURCE_LOG_CONFIG.csv.file, 'utf-8');
    expect((resourceCsvText.match(/DoThis\|DoThat/g) || []).length).to.equal(4); // number of rows
  });

  it('Check ObjectLogJson', async function () {
    if (fs.existsSync(RESOURCE_LOG_CONFIG.json.file)) fs.unlinkSync(RESOURCE_LOG_CONFIG.json.file);
    await new ObjectLogJson(TEST_RESOURCES, RESOURCE_LOG_CONFIG.json).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.json.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.json.file
  });
});
