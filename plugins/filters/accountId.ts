import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { Filter, FilterCtor, StringCompareOptions, arrayToOr } from './index.js';

export default class FilterAccountId implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'accountId';
  private compareOptions: StringCompareOptions;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterAccountId.FILTER_NAME, config));
      } else {
        this.compareOptions = new StringCompareOptions(StringCompareOptions.valueStringToOptions(config));
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    return this.compareOptions.compare(resource.accountId);
  }
}
