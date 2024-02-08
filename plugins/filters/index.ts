import { ToolingInterface } from '../../drivers/instrumentedResource';

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


/**
 * Create filter based on a generic config map. keys match up against file names for filters.
 * @param config
 */
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

// filter user only. converts an array set on a filter to an actual FilterOr
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

// filter user only. Controls the string value interpretation of all filters to facilite several comparison options
export class StringCompareOptions {

  static defaultCompare: string = 'equals'

  equals: string | undefined;
  iequals: string | undefined;
  contains: string | undefined;
  regexp: RegExp | undefined;
  startswith: string | undefined;
  endswith: string | undefined;

  constructor(config: any) {
    this.equals = config['equals'];
    this.iequals = config['iequals'];
    this.contains = config['contains'];
    this.startswith = config['startswith'];
    this.endswith = config['endswith'];

    if (config['regexp'] !== undefined) {
      // will throw on failure to compile
      this.regexp = new RegExp(config['regexp']);
    }
  }

  // order matters here if several options are specified. only one will be tested
  compare(value: string | undefined): boolean {
    if(value === undefined) {
      return false;
    }
    if(this.equals !== undefined) {
      return value === this.equals;
    }
    if(this.iequals !== undefined) {
      return value.toLowerCase() === this.iequals.toLowerCase();
    }
    else if (this.regexp !== undefined) {
      return this.regexp.exec(value) !== null;
    }
    else if (this.contains !== undefined) {
      return value.toLowerCase().includes(this.contains.toLowerCase());
    }
    else if (this.startswith !== undefined) {
      return value.toLowerCase().startsWith(this.startswith.toLowerCase());
    }
    else if (this.endswith !== undefined) {
      return value.toLowerCase().endsWith(this.endswith.toLowerCase());
    }
    else return false
  }

  // convert `key|value` or `key||option|value` to configuration for ctor
  // used by filters that have a key setting (e.g. tag and resource)
  static keyValueStringToOptions(value: string): [string, any] {
    const tokens = value.split('|');
    const key = tokens[0];
    if (tokens.length < 2) {
      // not valid
      return [key, {}]
    }
    if (tokens[1] === '' && tokens.length > 3) {
      // an |option| is specified
      // tokens[1] is an empty string due to ||
      return [key, {
        [tokens[2]]: tokens.slice(3).join('|'),
      }];
    }
    else {
      // default option case
      return [key,{
        [this.defaultCompare]: tokens.slice(1).join('|'),
      }];
    }
  }

  // convert `value` or `option|value` to to configuration for ctor
  // used by filters that don't have a key setting (any straight comparison filters)
  static valueStringToOptions(value: string): any {
    const tokens = value.split('|');
    if (tokens.length < 2) {
      return {
        [this.defaultCompare]: tokens[0],
      };
    }
    return{
      [tokens[0]]: tokens.slice(1).join('|'),
    };
  }
}
