import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
import { buildFilter } from '../../plugins/filters';
import { ToolingInterface } from '../../drivers/instrumentedResource';
import { DateTime } from 'luxon';

chai.use(chaiAsPromised);

class TestingResource extends ToolingInterface {

  private topResource: any;
  constructor(resource: any) {
    super(resource.resource);
    this.topResource = resource;
    // delete resource['resource'];
    if (this.topResource['tags'] === undefined) this.topResource['tags'] = {};
  }
  get launchTimeUtc(): DateTime {
    return DateTime.now();
  }

  get resourceArn(): string {
    return this.topResource['resourceArn'];
  }

  get resourceId(): string {
    return this.topResource['resourceId'];
  }

  get resourceState(): string {
    return this.topResource['resourceState'];
  }

  get resourceType(): string {
    return this.topResource['resourceType'];
  }

  tag(key: string): string | undefined {
    return this.topResource['tags'][key];
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
  },
  resource: {
    InstanceType: 't2.small',
    Placement: {
      AvailabilityZone: 'ap-southeast-2c',
      Tenancy: 'default',
    },
  }
}

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
    }
  }
}


const filterTests = [
  {
    name: 'id',
    tests: [
      { name: 'match', filter: { id: 'i-1234' }, resource: basicEc2, matches: true },
      { name: 'no match', filter: { id: 'i-23456' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'state',
    tests: [
      { name: 'match', filter: { state: 'running' }, resource: basicEc2, matches: true },
      { name: 'no match', filter: { id: 'stopped' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'type',
    tests: [
      { name: 'match', filter: { type: 'ec2' }, resource: basicEc2, matches: true },
      { name: 'no match', filter: { type: 'ec2' }, resource: basicRds, matches: false },
    ],
  },
  {
    name: 'region',
    tests: [
      { name: 'match', filter: { region: 'ap-southeast-2' }, resource: basicEc2, matches: true },
      { name: 'no match', filter: { region: 'us-east-1' }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'accountId',
    tests: [
      { name: 'match', filter: { accountId: '123456789012' }, resource: basicRds, matches: true },
      { name: 'no match', filter: { accountId: '999999999999' }, resource: basicRds, matches: false },
    ],
  },
  {
    name: 'tag',
    tests: [
      { name: 'match value', filter: { tag: { name: 'Schedule', value:'24x7'} }, resource: basicEc2, matches: true },
      { name: 'no match value', filter: { tag: { name: 'Schedule', value:'99x99'} }, resource: basicEc2, matches: false },
      { name: 'no match name', filter: { tag: { name: 'RandomTag', value:'things'} }, resource: basicEc2, matches: false },
      { name: 'match contains insensitive', filter: { tag: { name: 'CostCenter', contains:'primary'} }, resource: basicEc2, matches: true },
      { name: 'no match contains', filter: { tag: { name: 'CostCenter', contains:'blah'} }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'and',
    tests: [
      { name: 'match', filter: { and: [ {id: 'i-1234'}, { type: 'ec2'}, { state: 'running' }] }, resource: basicEc2, matches: true },
      { name: 'no match single', filter: { and: [ {id: 'i-2345'}, { type: 'ec2'}, { state: 'running' }] }, resource: basicEc2, matches: false },
      { name: 'no match any', filter: { and: [ {id: 'i-9876'}, { type: 'rds'}, { state: 'stopped' }] }, resource: basicEc2, matches: false },
      { name: 'no match empty filter', filter: { and: [] }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'or',
    tests: [
      { name: 'match single', filter: { or: [ {id: 'i-9999'}, { type: 'ec2'}, { state: 'stopped' }] }, resource: basicEc2, matches: true },
      { name: 'match multiple', filter: { or: [ {id: 'i-9999'}, { type: 'ec2'}, { state: 'running' }] }, resource: basicEc2, matches: true },
      { name: 'match all', filter: { or: [ {id: 'i-1234'}, { type: 'ec2'}, { state: 'running' }] }, resource: basicEc2, matches: true },
      { name: 'no match any', filter: { and: [ {id: 'i-9999'}, { type: 'rds'}, { state: 'stopped' }] }, resource: basicEc2, matches: false },
      { name: 'no match empty filter', filter: { or: [] }, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'bool',
    tests: [
      { name: 'match true', filter: { bool: true }, resource: basicEc2, matches: true },
      { name: 'no match false', filter: { bool: false}, resource: basicEc2, matches: false },
    ],
  },
  {
    name: 'resource',
    tests: [
      { name: 'match exact value', filter: { resource: { path: 'InstanceType', value: 't2.small'} }, resource: basicEc2, matches: true },
      { name: 'match contains', filter: { resource: { path: 'InstanceType', contains: 'small'} }, resource: basicEc2, matches: true },
      { name: 'no match contains', filter: { resource: { path: 'InstanceType', contains: 'large'} }, resource: basicEc2, matches: false },
      { name: 'match valid jmes with regex', filter: { resource: { path: 'Placement.AvailabilityZone', regexp: '\\w{2}.southeast.\\d\\w'} }, resource: basicEc2, matches: true },
      { name: 'no match invalid jmes', filter: { resource: { path: 'Placement.AvailabilityZone', regexp: '\\w{2}.southeast.\\d\\w'}}, resource:  basicRds, matches: false },
    ],
  },
  {
    name: 'implicit top level AND',
    tests: [
      { name: 'match and if top level is an array', filter: [ {resource: {path: 'InstanceType', value: 't2.small'}}, { id: 'i-1234'}], resource: basicEc2, matches: true },
      { name: 'no match and and if top level is an array', filter: [ {resource: {path: 'InstanceType', value: 't2.small'}}, { id: 'i-9999'}], resource: basicEc2, matches: false },
    ]
  },
  {
    name: 'implicit filter level OR',
    tests: [
      { name: 'match account ID or if filter value is a 1 array', filter: { accountId: ['123456789012']}, resource: basicEc2, matches: true },
      { name: 'match account ID or if filter value is a 2 array', filter: { accountId: ['999999999999', '123456789012']}, resource: basicEc2, matches: true },
      { name: 'no match account ID or if filter value is an empty array', filter: { accountId: []}, resource: basicEc2, matches: false },
      { name: 'no match account ID or if filter value is a 2 array', filter: { accountId: ['999999999999', '888888888888']}, resource: basicEc2, matches: false },
      { name: 'match ID in array', filter: { id: ['i-9999', 'i-1234']}, resource: basicEc2, matches: true },
      { name: 'match region in array', filter: { region: ['ap-southeast-2', 'us-east-1']}, resource: basicEc2, matches: true },
      { name: 'match state in array', filter: { state: ['stopped', 'running']}, resource: basicEc2, matches: true },
      { name: 'match type in array', filter: { type: ['ec2', 'rds']}, resource: basicEc2, matches: true },
    ]
  },
  {
    name: 'short string representation of filters',
    tests: [
      { name: 'match tag in array', filter: { tag: ['CostCenter|Primary-1234', 'CostCenter|Secondary-1234']}, resource: basicEc2, matches: true },
      { name: 'match tag single', filter: { tag: 'CostCenter|Primary-1234'}, resource: basicEc2, matches: true },
      { name: 'match mixed tag types in array', filter: { tag: ['CostCenter|Primary-1234', { name: 'CostCenter', value: 'Secondary-1234'}]}, resource: basicEc2, matches: true },
      { name: 'match resource in array', filter: { resource: ['Field.DoesNotExist|blah', 'Placement.AvailabilityZone|ap-southeast-2c']}, resource: basicEc2, matches: true },
      { name: 'match resource single', filter: { resource: 'Placement.AvailabilityZone|ap-southeast-2c'}, resource: basicEc2, matches: true },
      { name: 'match mixed resource types in array', filter: { resource: ['Field.DoesNotExist|blah', { path: 'Placement.AvailabilityZone', value: 'ap-southeast-2c'}]}, resource: basicEc2, matches: true },
    ]
  }
];

describe('filter', function () {
  for (const filterTest of filterTests) {
    describe(filterTest.name, async function() {
      for (const t of filterTest.tests) {
        it(t.name, async function() {
          const filter = await buildFilter(t.filter);
          expect(filter.matches(new TestingResource(t.resource))).to.be.equal(t.matches);
        });
      }
    });
  }
});
