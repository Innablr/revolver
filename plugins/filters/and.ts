import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterAnd implements Filter, FilterCtor {
  private elements: Filter[];

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      Promise.all(
        config.map(async (elem: any): Promise<Filter> => {
          const name = Object.keys(elem)[0];
          const i = await require(`./${name}`);
          return await new i.default(elem[name]).ready();
        }),
      ).then((results) => {
        this.elements = results;
        resolve(this);
      });
    });
  }

  matches(resource: ToolingInterface): boolean {
    if (this.elements.length === 0) return false;
    return this.elements.reduce<boolean>((a: boolean, b: Filter): boolean => {
      return a && b.matches(resource);
    }, true);
  }
}
