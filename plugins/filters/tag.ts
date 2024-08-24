import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { Filter, FilterCtor, StringCompareOptions, arrayToOr } from './index.js';

export default class FilterTag implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'tag';
  private tagName: string;
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
              name: key,
              ...opts,
            };
          } else {
            return elem;
          }
        });
        resolve(arrayToOr(FilterTag.FILTER_NAME, elements));
        return;
      }

      let appliedConfig = config;
      if (typeof config === 'string') {
        const [key, opts] = StringCompareOptions.keyValueStringToOptions(config);
        appliedConfig = {
          name: key,
          ...opts,
        };
      }
      this.tagName = appliedConfig.name;
      this.compareOptions = new StringCompareOptions(appliedConfig);
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const t = resource.tag(this.tagName);
    if (t === undefined) return false;
    return this.compareOptions.compare(t);
  }
}
