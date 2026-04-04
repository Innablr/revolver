import { expect } from 'chai';
import { DateTime } from 'luxon';
import dateTime from '../../lib/dateTime.ts';
import PowerCyclePlugin from '../../plugins/powercycle.ts';
import { ToolingInterface } from '../../drivers/instrumentedResource.ts';

// Minimal resource stub
class StubResource extends ToolingInterface {
  private readonly _tags: Record<string, string>;
  private readonly _state: string;

  constructor(tags: Record<string, string> = {}, state = 'running') {
    super({});
    this._tags = tags;
    this._state = state;
  }

  get resourceId() { return 'i-test'; }
  get resourceType() { return 'ec2'; }
  get resourceArn() { return 'arn:aws:ec2:ap-southeast-2:123:instance/i-test'; }
  get launchTimeUtc() { return DateTime.now(); }
  get resourceState() { return this._state; }
  get resourceTags() { return this._tags; }
  tag(key: string) { return this._tags[key]; }
}

const accountConfig = {
  accountId: '123456789012',
  settings: { name: 'test-account', timezone: 'UTC', timezoneTag: 'Timezone' },
};

const pluginConfig = { availabilityTag: 'Schedule', tagging: 'strict' };

async function makePlugin() {
  const p = new PowerCyclePlugin(accountConfig, 'powercycle', { ...pluginConfig });
  await p.initialise();
  return p;
}

describe('PowerCyclePlugin.generateActions', () => {
  // Friday 12:00 UTC
  const fakeNow = DateTime.fromISO('2024-06-14T12:00:00.000Z');

  beforeEach(() => dateTime.freezeTime(fakeNow.toISO()!));
  afterEach(() => dateTime.freezeTime(''));

  it('adds warning tag when Schedule tag is missing', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({});
    await plugin.generateActions(r);
    expect(r.actions).to.have.length(1);
    expect(r.actions[0].what).to.equal('setTag');
    expect((r.actions[0] as any).tags[0].Key).to.equal('WarningSchedule');
  });

  it('adds warning tag when Schedule tag is unparseable', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: 'garbage-value' });
    await plugin.generateActions(r);
    const setTagActions = r.actions.filter((a) => a.what === 'setTag');
    expect(setTagActions.some((a) => (a as any).tags[0].Key === 'WarningSchedule')).to.be.true;
  });

  it('adds start action for 24x7 schedule', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '24x7' }, 'stopped');
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'start')).to.be.true;
  });

  it('adds stop action for 0x7 schedule', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '0x7' }, 'running');
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'stop')).to.be.true;
  });

  it('adds noop for override=on', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: 'Override=On' });
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'noop')).to.be.true;
  });

  it('adds stop action for 24x5 on weekend', async () => {
    // Saturday
    dateTime.freezeTime('2024-06-15T12:00:00.000Z');
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '24x5' }, 'running');
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'stop')).to.be.true;
  });

  it('adds start action for 24x5 on weekday', async () => {
    // Monday
    dateTime.freezeTime('2024-06-17T12:00:00.000Z');
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '24x5' }, 'stopped');
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'start')).to.be.true;
  });

  it('sets reason tag when stopping a running resource', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '0x7' }, 'running');
    await plugin.generateActions(r);
    const tags = r.actions.filter((a) => a.what === 'setTag').map((a) => (a as any).tags[0].Key);
    expect(tags).to.include('ReasonSchedule');
  });

  it('sets reason tag when starting a non-running resource', async () => {
    const plugin = await makePlugin();
    const r = new StubResource({ Schedule: '24x7' }, 'stopped');
    await plugin.generateActions(r);
    const tags = r.actions.filter((a) => a.what === 'setTag').map((a) => (a as any).tags[0].Key);
    expect(tags).to.include('ReasonSchedule');
  });

  it('respects per-resource timezone tag', async () => {
    const plugin = await makePlugin();
    // 12:00 UTC = 22:00 AEST — outside business hours
    const r = new StubResource({ Schedule: 'Start=08:00|mon-fri;Stop=18:00|mon-fri', Timezone: 'Australia/Sydney' });
    await plugin.generateActions(r);
    expect(r.actions.some((a) => a.what === 'stop')).to.be.true;
  });
});
