import { expect } from 'chai';
import { ObjectLogConsole, ObjectLogCsv, ObjectLogJson, ObjectLogTemplate, ResourceTable } from '../../lib/objectLog';
import { ToolingInterface } from '../../drivers/instrumentedResource';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';

// A dummy AWS resource for testing
class FakeResource extends ToolingInterface {
  private myResourceId: string;
  private myResourceType: string;
  constructor(resource: any, resourceId: string, resourceType: string) {
    super(resource);
    this.myResourceId = resourceId;
    this.myResourceType = resourceType;
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
    return randomBytes(20).toString('hex');
  }
  tag(key: string): string | undefined {
    return `value:${key}`;
  }
}

const RESOURCE_LOG_CONFIG = {
  json: {
    file: 'out.json',
  },
  template: {
    file: 'out.template.html',
  },
  csv: {
    file: 'out.csv',
    reportTags: ['F1', 'F2'],
  },
  console: {
    reportTags: ['F1', 'F2'],
  },
};

const TEST_RESOURCES = [
  new FakeResource({ colour: 'gray' }, 'donkey', 'donkey'),
  new FakeResource({ colour: 'green' }, 'shrek', 'ogre'),
];

const ACCOUNT_CONFIG = {
  settings: {
    name: 'dummyaccount',
  },
};

describe('Validate ObjectLog', function () {
  // TODO: delete output files if they exist

  // TODO: ObjectLogConsole
  it('Check ObjectLogConsole', async function () {
    await new ObjectLogConsole(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      'My Fake Resources',
    ).process();
    // TODO: check the contents of console output
  });

  it('Check ObjectLogCsv', async function () {
    await new ObjectLogCsv(
      new ResourceTable(ACCOUNT_CONFIG, TEST_RESOURCES, RESOURCE_LOG_CONFIG.csv.reportTags),
      RESOURCE_LOG_CONFIG.csv,
      false,
    ).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.csv.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.csv.file
  });

  it('Check ObjectLogJson', async function () {
    await new ObjectLogJson(TEST_RESOURCES, RESOURCE_LOG_CONFIG.json).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.json.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.json.file
  });

  it('Check ObjectLogTemplate', async function () {
    await new ObjectLogTemplate(TEST_RESOURCES, RESOURCE_LOG_CONFIG.template).process();
    expect(fs.existsSync(RESOURCE_LOG_CONFIG.template.file)).to.be.true;
    // TODO: check the contents of RESOURCE_LOG_CONFIG.template.file
  });
});
