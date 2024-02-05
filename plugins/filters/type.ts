import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor } from './index';

export default class FilterType implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'type';
  private type: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterType.FILTER_NAME, config));
      } else {
        this.type = config;
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.resourceType === this.type;
  }
}
