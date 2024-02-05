import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor } from './index';

export default class FilterState implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'state';
  private state: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterState.FILTER_NAME, config));
      } else {
        this.state = config;
        resolve(this);
      }
    });
  }

  matches(resource: ToolingInterface): boolean {
    return resource.resourceState === this.state;
  }
}
