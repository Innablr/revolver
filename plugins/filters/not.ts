import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterNot implements Filter, FilterCtor {
  private element: Filter;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      const name = Object.keys(config)[0];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
