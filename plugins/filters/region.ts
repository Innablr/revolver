import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor, StringCompareOptions } from './index';

export default class FilterRegion implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'region';
  private compareOptions: StringCompareOptions;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterRegion.FILTER_NAME, config));
      } else {
        this.compareOptions = new StringCompareOptions(StringCompareOptions.valueStringToOptions(config));
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    return this.compareOptions.compare(resource.region);
  }
}
