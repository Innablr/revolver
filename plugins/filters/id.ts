import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor } from './index';

export default class FilterId implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'id';
  private id: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterId.FILTER_NAME, config));
      } else {
        this.id = config;
        resolve(this);
      }
    });
  }

  matches(resource: ToolingInterface): boolean {
    return resource.resourceId === this.id;
  }
}
