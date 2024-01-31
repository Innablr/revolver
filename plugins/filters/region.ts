import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterRegion implements Filter, FilterCtor {
  private region: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.region = config;
      resolve(this);
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.region === this.region;
  }
}
