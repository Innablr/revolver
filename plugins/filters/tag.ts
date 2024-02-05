import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor, stringToComponents } from "./index";

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
            const [key, val] = stringToComponents(elem);
            return {
              name: key,
              value: val,
            };
          } else {
            return elem;
          }
        });
        resolve(arrayToOr(FilterTag.FILTER_NAME, elements));
      } else if (typeof config === 'string') {
        const [key, val] = stringToComponents(config);
        this.tagName = key;
        this.tagValue = val;
        resolve(this);
      } else {
        this.tagName = config['name'];
        this.tagValue = config['value'];
        this.tagContains = config['contains'];
        resolve(this);
      }
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
