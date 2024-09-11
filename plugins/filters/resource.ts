import { search } from 'jmespath';
import type { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { type Filter, type FilterCtor, StringCompareOptions, arrayToOr } from './index.js';

export default class FilterResource implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'resource';
  private resourcePath: string;
  private compareOptions: StringCompareOptions;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        const elements = config.map((elem) => {
          if (typeof elem === 'string') {
            const [key, opts] = StringCompareOptions.keyValueStringToOptions(elem);
            return {
              path: key,
              ...opts,
            };
          } else {
            return elem;
          }
        });
        resolve(arrayToOr(FilterResource.FILTER_NAME, elements));
        return;
      }

      let appliedConfig = config;
      if (typeof config === 'string') {
        const [key, opts] = StringCompareOptions.keyValueStringToOptions(config);
        appliedConfig = {
          path: key,
          ...opts,
        };
      }

      // can't validate path as it depends on the input
      this.resourcePath = appliedConfig.path;
      this.compareOptions = new StringCompareOptions(appliedConfig);

      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const searchValue = search(resource.resource, this.resourcePath);
    if (searchValue === undefined) return false;
    return this.compareOptions.compare(searchValue);
  }
}
