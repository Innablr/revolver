import { expect } from 'chai';
import { SetTagAction, UnsetTagAction } from '../../actions/actions.ts';
import { ec2Tagger, rdsTagger } from '../../drivers/tags.ts';
import type { RevolverPlugin } from '../../plugins/pluginInterface.ts';
import { ToolingInterface } from '../../drivers/instrumentedResource.ts';
import { DateTime } from 'luxon';

const who = { name: 'test-plugin' } as unknown as RevolverPlugin;

class StubResource extends ToolingInterface {
  private readonly _tags: Record<string, string>;
  private readonly _id: string;
  private readonly _arn: string;

  constructor(id: string, tags: Record<string, string> = {}) {
    super({});
    this._id = id;
    this._tags = tags;
    this._arn = `arn:aws:ec2:ap-southeast-2:123456789012:instance/${id}`;
  }

  get resourceId() { return this._id; }
  get resourceType() { return 'ec2'; }
  get resourceArn() { return this._arn; }
  get launchTimeUtc() { return DateTime.now(); }
  get resourceState() { return 'running'; }
  get resourceTags() { return this._tags; }
  tag(key: string) { return this._tags[key]; }
}

describe('EC2Tagger mask methods', () => {
  describe('masksetTag', () => {
    it('returns message when tag already has the value', () => {
      const r = new StubResource('i-001', { Schedule: '24x7' });
      const action = new SetTagAction(who, 'Schedule', '24x7');
      const result = ec2Tagger.masksetTag(r, action);
      expect(result).to.be.a('string');
      expect(result).to.include('already has tags');
    });

    it('returns undefined when tag value differs', () => {
      const r = new StubResource('i-001', { Schedule: '0x7' });
      const action = new SetTagAction(who, 'Schedule', '24x7');
      expect(ec2Tagger.masksetTag(r, action)).to.be.undefined;
    });

    it('returns undefined when tag is missing', () => {
      const r = new StubResource('i-001', {});
      const action = new SetTagAction(who, 'Schedule', '24x7');
      expect(ec2Tagger.masksetTag(r, action)).to.be.undefined;
    });
  });

  describe('maskunsetTag', () => {
    it('returns message when tag is already absent', () => {
      const r = new StubResource('i-001', {});
      const action = new UnsetTagAction(who, 'Schedule');
      const result = ec2Tagger.maskunsetTag(r, action);
      expect(result).to.be.a('string');
      expect(result).to.include('has none tags');
    });

    it('returns undefined when tag exists', () => {
      const r = new StubResource('i-001', { Schedule: '24x7' });
      const action = new UnsetTagAction(who, 'Schedule');
      expect(ec2Tagger.maskunsetTag(r, action)).to.be.undefined;
    });
  });
});

describe('RDSTagger mask methods', () => {
  describe('masksetTag', () => {
    it('returns message when tag already has the value', () => {
      const r = new StubResource('db-001', { Schedule: '24x7' });
      const action = new SetTagAction(who, 'Schedule', '24x7');
      const result = rdsTagger.masksetTag(r, action);
      expect(result).to.be.a('string');
      expect(result).to.include('already has tags');
    });

    it('returns undefined when tag value differs', () => {
      const r = new StubResource('db-001', { Schedule: '0x7' });
      const action = new SetTagAction(who, 'Schedule', '24x7');
      expect(rdsTagger.masksetTag(r, action)).to.be.undefined;
    });
  });

  describe('maskunsetTag', () => {
    it('returns message when tag is already absent', () => {
      const r = new StubResource('db-001', {});
      const action = new UnsetTagAction(who, 'Schedule');
      const result = rdsTagger.maskunsetTag(r, action);
      expect(result).to.be.a('string');
      expect(result).to.include('has none tags');
    });

    it('returns undefined when tag exists', () => {
      const r = new StubResource('db-001', { Schedule: '24x7' });
      const action = new UnsetTagAction(who, 'Schedule');
      expect(rdsTagger.maskunsetTag(r, action)).to.be.undefined;
    });
  });
});
