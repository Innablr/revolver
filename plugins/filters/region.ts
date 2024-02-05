import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor } from './index';

export default class FilterRegion implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'region';
  private region: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterRegion.FILTER_NAME, config));
      } else {
        this.region = config;
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.region === this.region;
  }
}
