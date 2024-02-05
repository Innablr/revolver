import { ToolingInterface } from '../../drivers/instrumentedResource';
import path from 'node:path';

import FilterAnd from './and';
import FilterOr from './or';

export interface Filter {
  /**
   * Return true if a resource matches this filter
   * @param resource
   */
  matches(resource: ToolingInterface): boolean;
}

export interface FilterCtor {
  /**
   * Since the filters are loaded dynamically, an extra method is needed to track the
   * asynchronous status of the constructor.
   */
  ready(): Promise<Filter>;
}

export async function buildFilter(config: any): Promise<Filter> {
  if (Array.isArray(config)) {
    // if top level is array, put in an implicit AND filter
    return new FilterAnd(config).ready();
  } else {
    // otherwise load the filter as normal
    const name = Object.keys(config)[0];
    const i = await require(`./${name}`);
    return new i.default(config[name]).ready();
  }
}

export async function arrayToOr(filterName: string, config: any): Promise<Filter> {
  if (!Array.isArray(config)) {
    throw Error('not an array');
  }
  const orConfig = config.map((elem) => {
    return {
      [filterName]: elem,
    };
  });
  return new FilterOr(orConfig).ready();
}

export function stringToComponents(elem: string): [string, string] {
  const x = elem.split('|');
  const key = x[0];
  const val = x.slice(1).join('|');
  return [key, val]
}

/*
  Don't use this for anything other than tests
  Bundler needs to see a `require` with a literal string somewhere to work correctly
 */
export async function buildFilterOld(config: any): Promise<Filter> {
  const key = Object.keys(config)[0];
  const i = await import(path.join(__dirname, key));
  return new i.default(config[key]).ready();
}
