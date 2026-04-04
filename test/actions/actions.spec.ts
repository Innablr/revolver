import { expect } from 'chai';
import { NoopAction, SetTagAction, StartAction, StopAction, UnsetTagAction } from '../../actions/actions.ts';
import type { RevolverPlugin } from '../../plugins/pluginInterface.ts';

// Minimal plugin stub
const who = { name: 'test-plugin' } as unknown as RevolverPlugin;

describe('RevolverAction base', () => {
  it('like() matches same action type', () => {
    const a = new StopAction(who, 'reason');
    const b = new StopAction(who, 'other reason');
    expect(a.like(b)).to.be.true;
  });

  it('swallow() returns false by default', () => {
    const a = new StopAction(who, 'reason');
    const b = new StopAction(who, 'reason');
    expect(a.swallow(b)).to.be.false;
  });

  it('present returns what', () => {
    const a = new StartAction(who, 'reason');
    expect(a.present).to.equal('start');
  });
});

describe('NoopAction', () => {
  it('present includes reason', () => {
    const a = new NoopAction(who, 'already stopped');
    expect(a.present).to.equal('noop because already stopped');
  });

  it('like() matches same reason', () => {
    const a = new NoopAction(who, 'same');
    const b = new NoopAction(who, 'same');
    expect(a.like(b)).to.be.true;
  });

  it('like() does not match different reason', () => {
    const a = new NoopAction(who, 'same');
    const b = new NoopAction(who, 'different');
    expect(a.like(b)).to.be.false;
  });
});

describe('SetTagAction', () => {
  it('constructs with correct tag', () => {
    const a = new SetTagAction(who, 'Schedule', '24x7');
    expect(a.tags).to.deep.equal([{ Key: 'Schedule', Value: '24x7' }]);
    expect(a.what).to.equal('setTag');
    expect(a.reason).to.equal('Schedule:24x7');
  });

  it('present includes tags', () => {
    const a = new SetTagAction(who, 'Env', 'dev');
    expect(a.present).to.include('Env');
    expect(a.present).to.include('dev');
  });

  it('like() matches same tag key', () => {
    const a = new SetTagAction(who, 'Schedule', '24x7');
    const b = new SetTagAction(who, 'Schedule', '0x7');
    expect(a.like(b)).to.be.true;
  });

  it('like() does not match different tag key', () => {
    const a = new SetTagAction(who, 'Schedule', '24x7');
    const b = new SetTagAction(who, 'Env', '24x7');
    expect(a.like(b)).to.be.false;
  });

  it('swallow() merges non-duplicate tags', () => {
    const a = new SetTagAction(who, 'Schedule', '24x7');
    const b = new SetTagAction(who, 'Env', 'dev');
    const result = a.swallow(b);
    expect(result).to.be.true;
    expect(a.tags).to.have.length(2);
    expect(a.tags.map((t) => t.Key)).to.include('Env');
  });

  it('swallow() does not duplicate existing tag keys', () => {
    const a = new SetTagAction(who, 'Schedule', '24x7');
    const b = new SetTagAction(who, 'Schedule', '0x7');
    a.swallow(b);
    expect(a.tags).to.have.length(1);
  });
});

describe('UnsetTagAction', () => {
  it('constructs correctly', () => {
    const a = new UnsetTagAction(who, 'Schedule');
    expect(a.tags).to.deep.equal([{ Key: 'Schedule', Value: '' }]);
    expect(a.what).to.equal('unsetTag');
    expect(a.reason).to.equal('Schedule');
  });

  it('present includes tag', () => {
    const a = new UnsetTagAction(who, 'Schedule');
    expect(a.present).to.include('Schedule');
  });

  it('like() matches same tag key', () => {
    const a = new UnsetTagAction(who, 'Schedule');
    const b = new UnsetTagAction(who, 'Schedule');
    expect(a.like(b)).to.be.true;
  });

  it('like() does not match different tag key', () => {
    const a = new UnsetTagAction(who, 'Schedule');
    const b = new UnsetTagAction(who, 'Env');
    expect(a.like(b)).to.be.false;
  });

  it('swallow() merges non-duplicate tags', () => {
    const a = new UnsetTagAction(who, 'Schedule');
    const b = new UnsetTagAction(who, 'Env');
    const result = a.swallow(b);
    expect(result).to.be.true;
    expect(a.tags).to.have.length(2);
  });
});

describe('StopAction', () => {
  it('changesState is true', () => {
    const a = new StopAction(who, 'after hours');
    expect(a.changesState).to.be.true;
    expect(a.what).to.equal('stop');
    expect(a.reason).to.equal('after hours');
  });

  it('pretend defaults to false', () => {
    const a = new StopAction(who, 'reason');
    expect(a.pretend).to.be.false;
  });

  it('pretend can be set to true', () => {
    const a = new StopAction(who, 'reason', true);
    expect(a.pretend).to.be.true;
  });
});

describe('StartAction', () => {
  it('changesState is true', () => {
    const a = new StartAction(who, 'business hours');
    expect(a.changesState).to.be.true;
    expect(a.what).to.equal('start');
  });

  it('pretend can be set', () => {
    const a = new StartAction(who, 'reason', true);
    expect(a.pretend).to.be.true;
  });
});
