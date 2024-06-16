import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { arrayToOr, Filter, FilterCtor, StringCompareOptions } from './index.js';

export default class FilterId implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'id';
  private compareOptions: StringCompareOptions;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterId.FILTER_NAME, config));
      } else {
        this.compareOptions = new StringCompareOptions(StringCompareOptions.valueStringToOptions(config));
        resolve(this);
      }
    });
  }

  matches(resource: ToolingInterface): boolean {
    return this.compareOptions.compare(resource.resourceId);
  }
}
