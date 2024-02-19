import { expect } from 'chai';
import dateTime from '../../lib/dateTime';

describe('Validate filename tokens', function () {
  const timeStamp = '2024-02-19T04:40:44.526Z';
  dateTime.freezeTime(timeStamp);
  expect(dateTime.resolveFilename(undefined)).to.equal(undefined);
  expect(dateTime.resolveFilename('file.txt')).to.equal('file.txt');
  expect(dateTime.resolveFilename('file.%cccc.txt')).to.equal('file.Monday.txt');
  expect(dateTime.resolveFilename('file.%LLLL.txt')).to.equal('file.February.txt');
  expect(dateTime.resolveFilename('file.%yyyy%LL%dd.txt')).to.equal('file.20240219.txt');
});
