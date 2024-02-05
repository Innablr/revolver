import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor, stringToComponents } from './index';

export default class FilterTag implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'tag';
  private tagName: string;
  private tagValue: string;
  private tagContains: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        const elements = config.map((elem) => {
          if (typeof elem === 'string') {
            const [key, option, val] = stringToComponents(elem);
            return {
              name: key,
              [option || 'value']: val,
            };
          } else {
            return elem;
          }
        });
        resolve(arrayToOr(FilterTag.FILTER_NAME, elements));
        return
      }

      let appliedConfig = config;
      if (typeof config === 'string') {
        const [key, option, val] = stringToComponents(config);
        appliedConfig = {
          name: key,
          [option || 'value']: val,
        };
      }

      this.tagName = appliedConfig['name'];
      this.tagValue = appliedConfig['value'];
      this.tagContains = appliedConfig['contains'];
      resolve(this);

    });
  }



  matches(resource: ToolingInterface): boolean {
    const t = resource.tag(this.tagName);
    if (this.tagValue !== undefined) return t === this.tagValue;
    if (this.tagContains !== undefined && t !== undefined)
      return t.toLowerCase().includes(this.tagContains.toLowerCase());
    return false;
  }
}
