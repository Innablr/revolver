import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { Filter, FilterCtor } from './index.js';

export default class FilterNot implements Filter, FilterCtor {
  private element: Filter;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      const name = Object.keys(config)[0];
      const i = require(`./${name}`);
      new i.default(config[name]).ready().then((filter: Filter) => {
        this.element = filter;
        resolve(this);
      });
    });
  }
  matches(resource: ToolingInterface): boolean {
    return !this.element.matches(resource);
  }
}
