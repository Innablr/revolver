import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
import { InstrumentedResource, ToolingInterface } from '../../drivers/instrumentedResource';
import { DateTime } from 'luxon';
import { DriverInterface } from '../../drivers/driverInterface';

chai.use(chaiAsPromised);

class RandomInstrumentedResource extends ToolingInterface {
  get resourceId(): string {
    return Math.random().toString(36);
  }
  get resourceType(): string {
    throw new Error('Method not implemented.');
  }
  get resourceArn(): string {
    throw new Error('Method not implemented.');
  }
  get launchTimeUtc(): DateTime<boolean> {
    throw new Error('Method not implemented.');
  }
  get resourceState(): string {
    throw new Error('Method not implemented.');
  }
  tag(key: string): string | undefined {
    throw new Error(`Method not implemented. key=${key}`);
  }
  get resourceTags(): { [key: string]: string } {
    throw new Error('Method not implemented.');
  }
  get sizing(): any {
    throw new Error('Method not implemented.');
  }
}

describe('check toLimitedString', function () {
  class RandomDriver extends DriverInterface {
    constructor(accountConfig: any, driverConfig: any) {
      super(accountConfig, driverConfig);

      // RandomDriver.toLimitedString is protected

      for (let len = 0; len <= 3; len++) {
        const resources = Array(len).fill(new RandomInstrumentedResource(undefined));
        const s = RandomDriver.toLimitedString(resources);
        expect(s.split(',').length).to.equal(len ? len : 1);
        expect(s).to.contain(`(${len})`);
      }

      const resources20 = Array(20).fill(new RandomInstrumentedResource(undefined));
      const s20 = RandomDriver.toLimitedString(resources20);
      expect(s20.split(',').length).is.lessThan(10); // don't be too sensitive about the limit
      expect(s20).to.contain(`(20)`);
    }

    collect(): Promise<ToolingInterface[]> {
      throw new Error('Method not implemented.');
    }
    resource(obj: InstrumentedResource): ToolingInterface {
      throw new Error(`Method not implemented. obj=${obj}`);
    }
  }

  const accountConfig = { settings: { name: 'dummy account', accountId: '112233445566' } };
  const driverConfig = { name: 'dummy driver' };
  const foo = new RandomDriver(accountConfig, driverConfig);
  expect(foo).to.be.not.undefined;
});
