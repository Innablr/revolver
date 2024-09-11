import { expect } from 'chai';
import { FixedOffsetZone, DateTime as LuxonDateTime } from 'luxon';
import dateTime from '../../lib/dateTime.js';

describe('Validate DateTime', () => {
  it('Check DateTime freeze', async () => {
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
  });

  it('Check DateTime getUtcDateTime', async () => {
    // check basic Luxon date
    const nowUTC = LuxonDateTime.utc();
    const d1 = LuxonDateTime.utc(2017, 3, 12, 5, 45, 10, 765, { locale: 'fr' }); //~> 2017-03-12T05:45:10.765Z with a French locale
    expect(d1.invalidReason).to.be.null;
    expect(d1.isValid).to.be.true;
    expect(d1.zone).to.equal(nowUTC.zone);
    expect(d1.toISO()).to.equal('2017-03-12T05:45:10.765Z');

    // check non-UTC timezone
    const d2 = d1.setZone('Australia/Melbourne');
    expect(d2.invalidReason).to.be.null;
    expect(d2.isValid).to.be.true;
    expect(d2.zone).to.not.equal(nowUTC.zone);
    expect(d2.toISO()).to.equal('2017-03-12T16:45:10.765+11:00');

    // check LuxonDate (non-UTC) variant of getUtcDateTime
    const d3 = dateTime.getUtcDateTime(d2);
    expect(d3.invalidReason).to.be.null;
    expect(d3.isValid).to.be.true;
    expect(d3.zone).to.equal(nowUTC.zone);
    expect(d3.toISO()).to.equal('2017-03-12T05:45:10.765Z');

    // check JS Date (non-UTC) variant of getUtcDateTime
    const d4 = dateTime.getUtcDateTime(d2.toJSDate());
    expect(d4.invalidReason).to.be.null;
    expect(d4.isValid).to.be.true;
    expect(d4.zone).to.equal(nowUTC.zone);
    expect(d4.toISO()).to.equal('2017-03-12T05:45:10.765Z');

    // check String Date (non-UTC) variant of getUtcDateTime
    const d5 = dateTime.getUtcDateTime(d2.toISO());
    expect(d5.invalidReason).to.be.null;
    expect(d5.isValid).to.be.true;
    expect(d5.zone).to.equal(nowUTC.zone);
    expect(d5.toISO()).to.equal('2017-03-12T05:45:10.765Z');
  });

  it('Check DateTime calculateUptime', async () => {
    const now = LuxonDateTime.utc();
    const previous = now.minus({ minutes: 60 * 5 + 12 });
    dateTime.freezeTime(now.toISO());
    const uptime = dateTime.calculateUptime(previous);
    expect(uptime).to.equal(5.2);
  });

  it('Check different Timezones', async () => {
    //      * @param zone - a zone identifier. As a string, that can be any IANA zone supported by the host environment, or a fixed-offset name of the form 'UTC+3', or the strings 'local' or 'utc'.
    //  * You may also supply an instance of a {@link Zone} class. Defaults to 'local'.
    const time1 = dateTime.getTime('Australia/Melbourne');
    expect(time1.isValid).to.be.true;
    expect(time1.isOffsetFixed).to.be.false;

    const time2 = dateTime.getTime('UTC+10');
    expect(time2.isValid).to.be.true;
    expect(time2.isOffsetFixed).to.be.true;

    const time3 = dateTime.getTime('AEDT');
    expect(time3.isValid).to.be.false;
  });
});
