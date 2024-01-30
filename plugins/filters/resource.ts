import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';
import { search } from 'jmespath';

export default class FilterResource implements Filter, FilterCtor {
  private resourcePath: string;
  private resourceValue: string;
  private resourceRegexp: RegExp;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve, reject) => {
      // can't validate path as it depends on the input
      this.resourcePath = config['path'];
      this.resourceValue = config['value'];
      if (config['regexp'] !== undefined) {
        try {
          this.resourceRegexp = new RegExp(config['regexp']);
        } catch (e: any) {
          reject(`invalid regexp "${config['regexp']}" in filter: ${e.message}"`);
        }
      }

      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const searchValue = search(resource.resource, this.resourcePath);
    if (this.resourceValue !== undefined) {
      return searchValue === this.resourceValue;
    }

    if (this.resourceRegexp !== undefined) {
      const match = this.resourceRegexp.exec(searchValue);
      return match !== null;
    }
    return false;
  }
}
