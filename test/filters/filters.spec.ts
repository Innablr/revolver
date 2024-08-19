import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
import { buildFilter } from '../../plugins/filters/index.js';
import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { DateTime, Interval } from 'luxon';
import { makeResourceTags } from '../../lib/common.js';
import dateTime from '../../lib/dateTime.js';

chai.use(chaiAsPromised);

class TestingResource extends ToolingInterface {
  private topResource: any;
  constructor(resource: any) {
    super(resource.resource);
    this.topResource = resource;
    // delete resource['resource'];
    if (this.topResource.tags === undefined) this.topResource.tags = {};
  }
  get launchTimeUtc(): DateTime {
    return DateTime.now();
  }

  get resourceArn(): string {
    return this.topResource.resourceArn;
  }

  get resourceId(): string {
    return this.topResource.resourceId;
  }

  get resourceState(): string {
    return this.topResource.resourceState;
  }

  get resourceType(): string {
    return this.topResource.resourceType;
  }

  tag(key: string): string | undefined {
    return this.topResource.tags[key];
  }
  get resourceTags(): { [key: string]: string } {
    return makeResourceTags(this.topResource.tags);
  }
}

const basicEc2 = {
  resourceId: 'i-1234',
  resourceArn: 'arn:aws:ec2:ap-southeast-2:123456789012:volume/i-1234',
  resourceType: 'ec2',
  resourceState: 'running',
  tags: {
    Schedule: '24x7',
    CostCenter: 'Primary-1234',
    Name: 'app-server-1',
  },
  resource: {
    InstanceType: 't2.small',
    Placement: {
      AvailabilityZone: 'ap-southeast-2c',
      Tenancy: 'default',
    },
  },
};

const basicRds = {
  resourceId: 'revolver-test',
  resourceArn: 'arn:aws:rds:ap-southeast-2:123456789012:db:revolver-test',
  resourceType: 'rdsInstance',
  resourceState: 'running',
  tags: {
    Schedule: '24x7',
    CostCenter: 'Primary-1234',
  },
  resource: {
    DBInstanceClass: 'db.t3.micro',
    Engine: 'postgres',
    AvailabilityZone: 'ap-southeast-2b',
    DBSubnetGroup: {
      DBSubnetGroupName: 'default',
      DBSubnetGroupDescription: 'default',
      VpcId: 'vpc-12345678',
    },
  },
};

const filterTests = [
  {
    name: 'id',
    tests: [
      { name: 'match default', filter: { id: 'i-1234' }, resource: basicEc2, matches: true },
      { name: 'match equals', filter: { id: 'equals|i-1234' }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { id: 'contains|i-1' }, resource: basicEc2, matches: true },
      { name: 'match regexp', filter: { id: 'regexp|\\w\\-\\d{4}' }, resource: basicEc2, matches: true },
      { name: 'no match default', filter: { id: 'i-23456' }, resource: basicEc2, matches: false },
      { name: 'no match equals', filter: { id: 'equals|i-23456' }, resource: basicEc2, matches: false },
      { name: 'no match contains', filter: { id: 'contains|j-123' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'state',
    tests: [
      { name: 'match default', filter: { state: 'running' }, resource: basicEc2, matches: true },
      { name: 'match equals', filter: { state: 'equals|running' }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { state: 'contains|run' }, resource: basicEc2, matches: true },
      { name: 'match regexp', filter: { state: 'regexp|\\w{4}' }, resource: basicEc2, matches: true },
      { name: 'no match default', filter: { id: 'stopped' }, resource: basicEc2, matches: false },
      { name: 'no match equals', filter: { id: 'equals|stopped' }, resource: basicEc2, matches: false },
      { name: 'no match contains', filter: { id: 'contains|stop' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'type',
    tests: [
      { name: 'match default', filter: { type: 'ec2' }, resource: basicEc2, matches: true },
      { name: 'match equals', filter: { type: 'equals|ec2' }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { type: 'contains|ec' }, resource: basicEc2, matches: true },
      { name: 'match regexp', filter: { type: 'regexp|\\d' }, resource: basicEc2, matches: true },
      { name: 'no match default', filter: { type: 'ec2' }, resource: basicRds, matches: false },
      { name: 'no match equals', filter: { type: 'equals|ec2' }, resource: basicRds, matches: false },
      { name: 'no match contains', filter: { type: 'contains|ec' }, resource: basicRds, matches: false },
    ],
  },
  {
    name: 'region',
    tests: [
      { name: 'match default', filter: { region: 'ap-southeast-2' }, resource: basicEc2, matches: true },
      { name: 'match equals', filter: { region: 'equals|ap-southeast-2' }, resource: basicEc2, matches: true },
      { name: 'match iequals', filter: { region: 'iequals|AP-SOUTHEAST-2' }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { region: 'contains|southeast' }, resource: basicEc2, matches: true },
      { name: 'match regexp', filter: { region: 'regexp|ap\\-.*\\d$' }, resource: basicEc2, matches: true },
      { name: 'match startswith', filter: { region: 'startswith|ap-south' }, resource: basicEc2, matches: true },
      { name: 'match endswith', filter: { region: 'endswith|east-2' }, resource: basicEc2, matches: true },
      { name: 'no match default', filter: { region: 'us-east-1' }, resource: basicEc2, matches: false },
      { name: 'no match equals', filter: { region: 'equals|us-east-1' }, resource: basicEc2, matches: false },
      { name: 'no match equals case', filter: { region: 'equals|AP-SOUTHEAST-2' }, resource: basicEc2, matches: false },
      { name: 'no match iequals', filter: { region: 'iequals|us-east-1' }, resource: basicEc2, matches: false },
      { name: 'no match contains', filter: { region: 'contains|us-' }, resource: basicEc2, matches: false },
      { name: 'no match regexp', filter: { region: 'regexp|^\\d{2}' }, resource: basicEc2, matches: false },
      { name: 'no match startswith', filter: { region: 'startswith|east-2' }, resource: basicEc2, matches: false },
      { name: 'no match endswith', filter: { region: 'endswith|ap-south' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'accountId',
    tests: [
      { name: 'match default', filter: { accountId: '123456789012' }, resource: basicRds, matches: true },
      { name: 'match equals', filter: { accountId: 'equals|123456789012' }, resource: basicRds, matches: true },
      { name: 'match contains', filter: { accountId: 'contains|5678' }, resource: basicRds, matches: true },
      { name: 'match regexp', filter: { accountId: 'regexp|\\d{12}' }, resource: basicRds, matches: true },
      { name: 'no match default', filter: { accountId: '999999999999' }, resource: basicRds, matches: false },
      { name: 'no match regexp', filter: { accountId: 'regexp|^\\d{6}$' }, resource: basicRds, matches: false },
      { name: 'no match contains', filter: { accountId: 'contains|999' }, resource: basicRds, matches: false },
    ],
  },
  {
    name: 'name',
    tests: [
      { name: 'match default', filter: { name: 'app-server-1' }, resource: basicEc2, matches: true },
      { name: 'match equals', filter: { name: 'equals|app-server-1' }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { name: 'contains|server' }, resource: basicEc2, matches: true },
      { name: 'match startswith', filter: { name: 'startswith|app' }, resource: basicEc2, matches: true },
      { name: 'match endswith', filter: { name: 'endswith|-1' }, resource: basicEc2, matches: true },
      { name: 'match regexp', filter: { name: 'regexp|^[a-z]+\\-[a-z]+\\-\\d$' }, resource: basicEc2, matches: true },
      { name: 'no match default', filter: { name: 'db-server-1' }, resource: basicEc2, matches: false },
      { name: 'no match regexp', filter: { name: 'regexp|\\d{2}$' }, resource: basicEc2, matches: false },
      { name: 'no match contains', filter: { name: 'contains|db' }, resource: basicEc2, matches: false },
      { name: 'no match no tag', filter: { name: 'contains|' }, resource: basicRds, matches: false },
      { name: 'match tag exists', filter: { name: 'contains|' }, resource: basicEc2, matches: true },
    ],
  },
  {
    name: 'tag',
    tests: [
      { name: 'match value', filter: { tag: { name: 'Schedule', equals: '24x7' } }, resource: basicEc2, matches: true },
      {
        name: 'no match value',
        filter: { tag: { name: 'Schedule', equals: '99x99' } },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'no match name',
        filter: { tag: { name: 'RandomTag', equals: 'things' } },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'match contains insensitive',
        filter: { tag: { name: 'CostCenter', contains: 'primary' } },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match contains',
        filter: { tag: { name: 'CostCenter', contains: 'blah' } },
        resource: basicEc2,
        matches: false,
      },
    ],
  },
  {
    name: 'and',
    tests: [
      {
        name: 'match',
        filter: { and: [{ id: 'i-1234' }, { type: 'ec2' }, { state: 'running' }] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match single',
        filter: { and: [{ id: 'i-2345' }, { type: 'ec2' }, { state: 'running' }] },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'no match any',
        filter: { and: [{ id: 'i-9876' }, { type: 'rds' }, { state: 'stopped' }] },
        resource: basicEc2,
        matches: false,
      },
      { name: 'no match empty filter', filter: { and: [] }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'or',
    tests: [
      {
        name: 'match single',
        filter: { or: [{ id: 'i-9999' }, { type: 'ec2' }, { state: 'stopped' }] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match multiple',
        filter: { or: [{ id: 'i-9999' }, { type: 'ec2' }, { state: 'running' }] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match all',
        filter: { or: [{ id: 'i-1234' }, { type: 'ec2' }, { state: 'running' }] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match any',
        filter: { and: [{ id: 'i-9999' }, { type: 'rds' }, { state: 'stopped' }] },
        resource: basicEc2,
        matches: false,
      },
      { name: 'no match empty filter', filter: { or: [] }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'bool',
    tests: [
      { name: 'match true', filter: { bool: true }, resource: basicEc2, matches: true },
      { name: 'no match false', filter: { bool: false }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'resource',
    tests: [
      {
        name: 'match exact value',
        filter: { resource: { path: 'InstanceType', equals: 't2.small' } },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match contains',
        filter: { resource: { path: 'InstanceType', contains: 'small' } },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match contains',
        filter: { resource: { path: 'InstanceType', contains: 'large' } },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'match valid jmes with regex',
        filter: { resource: { path: 'Placement.AvailabilityZone', regexp: '\\w{2}.southeast.\\d\\w' } },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match invalid jmes',
        filter: { resource: { path: 'Placement.AvailabilityZone', regexp: '\\w{2}.southeast.\\d\\w' } },
        resource: basicRds,
        matches: false,
      },
    ],
  },
  {
    name: 'implicit top level AND',
    tests: [
      {
        name: 'match and if top level is an array',
        filter: [{ resource: { path: 'InstanceType', equals: 't2.small' } }, { id: 'i-1234' }],
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match and and if top level is an array',
        filter: [{ resource: { path: 'InstanceType', equals: 't2.small' } }, { id: 'i-9999' }],
        resource: basicEc2,
        matches: false,
      },
    ],
  },
  {
    name: 'implicit filter level OR',
    tests: [
      {
        name: 'match account ID or if filter value is a 1 array',
        filter: { accountId: ['123456789012'] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match account ID or if filter value is a 2 array',
        filter: { accountId: ['999999999999', '123456789012'] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match account ID or if filter value is an empty array',
        filter: { accountId: [] },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'no match account ID or if filter value is a 2 array',
        filter: { accountId: ['999999999999', '888888888888'] },
        resource: basicEc2,
        matches: false,
      },
      { name: 'match ID in array', filter: { id: ['i-9999', 'i-1234'] }, resource: basicEc2, matches: true },
      {
        name: 'match region in array',
        filter: { region: ['ap-southeast-2', 'us-east-1'] },
        resource: basicEc2,
        matches: true,
      },
      { name: 'match state in array', filter: { state: ['stopped', 'running'] }, resource: basicEc2, matches: true },
      { name: 'match type in array', filter: { type: ['ec2', 'rds'] }, resource: basicEc2, matches: true },
    ],
  },
  {
    name: 'short string representation of filters',
    tests: [
      {
        name: 'match tag in array',
        filter: { tag: ['CostCenter|Primary-1234', 'CostCenter|Secondary-1234'] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match tag in array',
        filter: { tag: ['CostCenter|Primary-8765', 'CostCenter|Secondary-1234'] },
        resource: basicEc2,
        matches: false,
      },
      { name: 'match tag single', filter: { tag: 'CostCenter|Primary-1234' }, resource: basicEc2, matches: true },
      { name: 'no match tag single', filter: { tag: 'CostCenter|Secondary-1234' }, resource: basicEc2, matches: false },
      {
        name: 'match mixed tag types in array',
        filter: { tag: ['CostCenter|Primary-1234', { name: 'CostCenter', value: 'Secondary-1234' }] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match tag single value',
        filter: { tag: 'CostCenter||equals|Primary-1234' },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match tag single contains',
        filter: { tag: 'CostCenter||contains|Primary' },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match resource in array',
        filter: { resource: ['Field.DoesNotExist|blah', 'Placement.AvailabilityZone|ap-southeast-2c'] },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match resource in array',
        filter: { resource: ['Field.DoesNotExist|blah', 'Placement.AvailabilityZone|us-east-1a'] },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'match resource single',
        filter: { resource: 'Placement.AvailabilityZone|ap-southeast-2c' },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'no match resource single',
        filter: { resource: 'Placement.AvailabilityZone|us-east-1a' },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'match mixed resource types in array',
        filter: {
          resource: ['Field.DoesNotExist|blah', { path: 'Placement.AvailabilityZone', equals: 'ap-southeast-2c' }],
        },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match resource single value',
        filter: { resource: 'Placement.AvailabilityZone||equals|ap-southeast-2c' },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match resource single contains',
        filter: { resource: 'Placement.AvailabilityZone||contains|southeast' },
        resource: basicEc2,
        matches: true,
      },
      {
        name: 'match resource single regex',
        filter: { resource: 'Placement.AvailabilityZone||regexp|\\w{2}\\-\\w+\\-\\d\\w' },
        resource: basicEc2,
        matches: true,
      },
    ],
  },
  {
    name: 'matchWindow',
    tests: [
      // Time is frozen at '2024-02-19T21:56Z'.  Dates with no timezone specified will be resolved in local timezone.
      { name: 'null match', filter: { matchWindow: {} }, resource: basicEc2, matches: false }, // no start, no end
      { name: 'match from yes', filter: { matchWindow: { from: '2024-02-05' } }, resource: basicEc2, matches: true },
      { name: 'match from no', filter: { matchWindow: { from: '2024-02-22' } }, resource: basicEc2, matches: false },
      { name: 'match to yes', filter: { matchWindow: { to: '2024-02-28' } }, resource: basicEc2, matches: true },
      { name: 'match to no', filter: { matchWindow: { to: '2024-02-10' } }, resource: basicEc2, matches: false },
      {
        name: 'in early',
        filter: { matchWindow: { from: '2024-02-05', to: '2024-02-07' } },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'in late',
        filter: { matchWindow: { from: '2024-03-05', to: '2024-03-07' } },
        resource: basicEc2,
        matches: false,
      },
      {
        name: 'in ok',
        filter: { matchWindow: { from: '2024-02-15', to: '2024-02-25' } },
        resource: basicEc2,
        matches: true,
      },

      // Time is frozen at '2024-02-19T21:56Z'
      { name: 'fine1', filter: { matchWindow: { from: '2024-02-19T21:00Z' } }, resource: basicEc2, matches: true },
      { name: 'fine2', filter: { matchWindow: { from: '2024-02-19T22:00Z' } }, resource: basicEc2, matches: false },
      { name: 'fine3', filter: { matchWindow: { from: '2024-02-19T21:00+10:00' } }, resource: basicEc2, matches: true }, // 11:00
      { name: 'fine4', filter: { matchWindow: { from: '2024-02-19T23:00+02:00' } }, resource: basicEc2, matches: true }, // 21:00
      {
        name: 'fine5',
        filter: { matchWindow: { from: '2024-02-19T23:00+01:00' } },
        resource: basicEc2,
        matches: false,
      }, // 22:00
    ],
  },
];

describe('filter', function () {
  for (const filterTest of filterTests) {
    describe(filterTest.name, async function () {
      for (const t of filterTest.tests) {
        it(t.name, async function () {
          const filter = await buildFilter(t.filter);
          dateTime.freezeTime('2024-02-19T21:56Z');
          expect(filter.matches(new TestingResource(t.resource))).to.be.equal(t.matches);
        });
      }
    });
  }
});

describe('filter matchWindow', function () {
  it('matchWindow', async function () {
    const fromTime = DateTime.utc(2024, 2, 19, 21, 0, 0, 0);
    const filter = await buildFilter({ matchWindow: { from: fromTime.toISO() } });

    const startTime = DateTime.local(2024, 2, 18, 0, 0, 0, 0);
    const interval = Interval.fromDateTimes(startTime, startTime.plus({ days: 4 }));
    const testTimes = interval.splitBy({ minutes: 60 }).map((d) => d.start);

    // validate that the filter doesn't match until the fromTime
    for (const t of testTimes) {
      if (t === null) continue; // shut up typescript
      dateTime.freezeTime(t.toString());
      const matches = filter.matches(new TestingResource(basicEc2));
      // console.log('%s (%s) = %s', t, t.toUTC(), matches);
      expect(matches).to.be.equal(t >= fromTime);
    }
  });
});
