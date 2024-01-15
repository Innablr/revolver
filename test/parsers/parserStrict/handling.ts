import getParser from '../../../plugins/parsers';
import { expect } from 'chai';
import { DateTime } from 'luxon';

const timeNow = DateTime.now();

describe('Strict parser handles different corner cases', async function () {
  const strictParser = await getParser('strict');
  describe('tag letters case', function () {
    const cases = [
      'Start=08:30;Stop=17:30;Override=No',
      'start=08:30;stop=17:30;override=no',
      'START=08:30;STOP=17:30;OVERRIDE=NO',
    ];
    const er = strictParser('start=08:30;stop=17:30;override=no', timeNow);
    cases.forEach(function (c) {
      it(`for ${c}`, function () {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [action, reason] = strictParser(c, timeNow);
        expect(strictParser(c, timeNow)).to.have.ordered.members(er);
      });
    });
  });
});
