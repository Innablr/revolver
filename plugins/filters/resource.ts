import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor, stringToComponents } from './index';
import { search } from 'jmespath';

export default class FilterResource implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'resource';
  private resourcePath: string;
  private resourceValue: string;
  private resourceRegexp: RegExp;
  private resourceContains: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve, reject) => {
      if (Array.isArray(config)) {
        const elements = config.map((elem) => {
          if (typeof elem === 'string') {
            const [key, option, val] = stringToComponents(elem);
            return {
              path: key,
              [option || 'value']: val,
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
        const [key, option, val] = stringToComponents(config);
        appliedConfig = {
          path: key,
          [option || 'value']: val,
        };
      }

      // can't validate path as it depends on the input
      this.resourcePath = appliedConfig['path'];
      this.resourceValue = appliedConfig['value'];
      this.resourceContains = appliedConfig['contains'];
      if (appliedConfig['regexp'] !== undefined) {
        try {
          this.resourceRegexp = new RegExp(appliedConfig['regexp']);
        } catch (e: any) {
          reject(`invalid regexp "${appliedConfig['regexp']}" in filter: ${e.message}"`);
        }
      }

      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const searchValue = search(resource.resource, this.resourcePath);
    if (this.resourceValue !== undefined) return searchValue === this.resourceValue;
    if (searchValue !== undefined && this.resourceRegexp !== undefined) {
      const match = this.resourceRegexp.exec(searchValue);
      return match !== null;
    }
    if (searchValue !== undefined && this.resourceContains !== undefined) {
      const str = searchValue.toString();
      return str.toLowerCase().includes(this.resourceContains);
    }
    return false;
  }
}
