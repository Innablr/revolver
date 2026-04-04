import { expect } from 'chai';
import { DateTime } from 'luxon';
import { NoopAction, StartAction, StopAction } from '../../actions/actions.ts';
import type { RevolverPlugin } from '../../plugins/pluginInterface.ts';
import { ToolingInterface } from '../../drivers/instrumentedResource.ts';

const who = { name: 'test-plugin' } as unknown as RevolverPlugin;

// Minimal concrete implementation for testing
class TestResource extends ToolingInterface {
  private readonly arn: string;

  constructor(resource: any, arn: string) {
    super(resource);
    this.arn = arn;
  }
  get resourceId() { return this.resource.id; }
  get resourceType() { return 'test'; }
  get resourceArn() { return this.arn; }
  get launchTimeUtc() { return DateTime.now(); }
  get resourceState() { return 'running'; }
  get resourceTags() { return this.resource.tags ?? {}; }
  tag(key: string) { return this.resource.tags?.[key]; }
}

describe('ToolingInterface ARN parsing', () => {
  const r = new TestResource({ id: 'i-123' }, 'arn:aws:ec2:ap-southeast-2:123456789012:instance/i-123');

  it('parses region', () => {
    expect(r.region).to.equal('ap-southeast-2');
  });

  it('parses accountId', () => {
    expect(r.accountId).to.equal('123456789012');
  });

  it('parses awsResourceType', () => {
    expect(r.awsResourceType).to.equal('ec2');
  });

  it('returns undefined for region when ARN is undefined', () => {
    const r2 = new TestResource({ id: 'x' }, undefined as any);
    expect(r2.region).to.be.undefined;
  });

  it('returns undefined for short ARN', () => {
    const r2 = new TestResource({ id: 'x' }, 'arn:aws:ec2');
    expect(r2.region).to.be.undefined;
  });
});

describe('ToolingInterface addAction', () => {
  it('adds an action', () => {
    const r = new TestResource({ id: 'i-1' }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    r.addAction(new StopAction(who, 'after hours'));
    expect(r.actions).to.have.length(1);
  });

  it('does not add duplicate action', () => {
    const r = new TestResource({ id: 'i-1' }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    r.addAction(new StopAction(who, 'reason'));
    r.addAction(new StopAction(who, 'reason'));
    expect(r.actions).to.have.length(1);
  });

  it('does not add second state-changing action', () => {
    const r = new TestResource({ id: 'i-1' }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    r.addAction(new StopAction(who, 'reason'));
    r.addAction(new StartAction(who, 'other reason'));
    expect(r.actions).to.have.length(1);
    expect(r.actions[0].what).to.equal('stop');
  });

  it('allows non-state-changing action alongside state-changing action', () => {
    const r = new TestResource({ id: 'i-1' }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    r.addAction(new StopAction(who, 'reason'));
    r.addAction(new NoopAction(who, 'just noting'));
    expect(r.actions).to.have.length(2);
  });

  it('toJSON returns expected shape', () => {
    const r = new TestResource({ id: 'i-1' }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    const json = r.toJSON();
    expect(json.resourceId).to.equal('i-1');
    expect(json.resourceType).to.equal('test');
    expect(json.resourceState).to.equal('running');
  });
});

describe('ToolingInterface tags', () => {
  it('tag() returns value for existing key', () => {
    const r = new TestResource({ id: 'i-1', tags: { Name: 'my-server' } }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    expect(r.tag('Name')).to.equal('my-server');
  });

  it('tag() returns undefined for missing key', () => {
    const r = new TestResource({ id: 'i-1', tags: {} }, 'arn:aws:ec2:ap-southeast-2:123:instance/i-1');
    expect(r.tag('Missing')).to.be.undefined;
  });
});
