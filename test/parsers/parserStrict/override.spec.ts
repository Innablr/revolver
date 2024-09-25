import { expect } from 'chai';
import { DateTime } from 'luxon';
import getParser from '../../../plugins/parsers/index.js';

const timeNow = DateTime.now();

describe('Strict parser detects override', async () => {
  const strictParser = await getParser('strict');
  describe('Strict parser detects override enabled', () => {
    const cases = [
      'Start=08:30;Stop=17:30;Override=on',
      'Start=08:30;Stop=17:30;Override=yes',
      'Start=08:30;Override=yes',
      'Stop=08:30;Override=yes',
      'Override=on',
      'Override=yes',
      'Override',
      'None',
      'NONE',
    ];
    cases.forEach((c) => {
      it(`in ${c}`, () => {
        const [action, reason] = strictParser(c, timeNow);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal('Availability override');
      });
    });
  });
  describe('Strict parser detects override disabled', () => {
    const cases = [
      'Start=08:30;Stop=17:30;Override=off',
      'Start=08:30;Stop=17:30',
      'Stop=17:30',
      'Start=08:30;Override=no',
      'Override=off',
    ];
    cases.forEach((c) => {
      it(`in ${c}`, () => {
        const [_action, reason] = strictParser(c, timeNow);
        expect(reason).to.not.equal('Availability override');
      });
    });
  });
});
