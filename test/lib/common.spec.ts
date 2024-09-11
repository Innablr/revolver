import { expect } from 'chai';
import { chunkArray, makeResourceTags, paginateAwsCall, unique } from '../../lib/common.js';

describe('Validate utility functions', function () {
  it('Check paginateAwsCall', async function () {
    function* paginatorFunc(_config: any, _request: any) {
      yield { what: 'a', another: 1 };
      yield { what: 'b', thing: 2 };
      yield { what: 'c' };
    }
    const stuff = await paginateAwsCall(paginatorFunc, { client: 'client' }, 'what', { params: 'params' });
    expect(stuff).to.be.an('array');
    expect(stuff).to.have.lengthOf(3);
    expect(stuff).to.deep.equal(['a', 'b', 'c']);
  });

  // chunkArray
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const chunks = chunkArray(alphabet, 5);
  expect(chunks).to.be.an('array');
  expect(chunks).to.have.lengthOf(6);
  expect(chunks[0]).to.have.lengthOf(5);
  expect(chunks[5]).to.have.lengthOf(1);
  expect(chunks.flat()).to.have.lengthOf(26);
  expect(chunks.flat()).to.deep.equal(alphabet);

  // unique
  const things = 'abcdaefghia'.split('');
  const uniqueThings = unique(things);
  expect(uniqueThings).to.have.lengthOf(9);
  expect(uniqueThings).to.deep.equal('abcdefghi'.split(''));

  // makeResourceTags
  const tagList = [
    { Key: 'a', Value: '1' },
    { Key: 'b', Value: '2' },
    { Key: 'c', Value: '3' },
  ];
  const tags = makeResourceTags(tagList);
  expect(tags).to.be.an('object');
  expect(tags).to.have.property('a', '1');
  expect(tags).to.have.property('b', '2');
  expect(tags).to.have.property('c', '3');
  expect(tags).to.not.have.property('d');
  const noTags = makeResourceTags(undefined);
  expect(noTags).to.be.an('object');
  expect(noTags).to.be.empty;
});
