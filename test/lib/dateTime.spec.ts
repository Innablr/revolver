import { expect } from 'chai';
import dateTime from '../../lib/dateTime.js';
import { FixedOffsetZone } from 'luxon';

describe('Validate DateTime', function () {
  it('Check DateTime freeze', async function () {
    const d1 = dateTime.getTime();
    expect(d1.zone).to.equal(FixedOffsetZone.instance(0));

    const d2 = dateTime.getTime('Australia/Melbourne');
    expect(d2.zone.name).to.equal('Australia/Melbourne');

    const d3 = dateTime.getTime('xyzzy');
    expect(d3.invalidReason).to.equal('unsupported zone');

    dateTime.freezeTime('2024-02-19T21:56Z');
    const d4 = dateTime.getTime('Australia/Melbourne');
    expect(d4.toISO()).to.equal('2024-02-20T08:56:00.000+11:00');

    dateTime.freezeTime('');
    const d5 = dateTime.getTime('Australia/Melbourne');
    expect(d5.invalidReason).to.equal('unparsable');
    expect(d5.toISO()).to.be.null;
    console.info('D5: %s', d5);
  });
});
