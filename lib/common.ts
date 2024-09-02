import dateTime from './dateTime.js';

async function paginateAwsCall(paginatorRef: any, client: any, what: string, params?: any) {
  // TODO: improve parameter typing:
  //   paginatorRef = f(PaginationConfiguration, request)
  //   client = Client
  const parameters = params || {};
  const paginator = paginatorRef({ client: client }, parameters);
  const entityList: any[] = [];
  for await (const page of paginator) {
    entityList.push(...page[what]);
  }
  return entityList;
}

function chunkArray<T>(arr: T[], len: number): T[][] {
  const chunks = [];
  let i = 0;
  const n = arr.length;
  while (i < n) {
    // biome-ignore lint/suspicious/noAssignInExpressions: OK
    chunks.push(arr.slice(i, (i += len)));
  }
  return chunks;
}

function uniqueBy<T>(array: T[], criterion: (item: T) => any): T[] {
  const uniqueItems: T[] = [];
  const seenCriteria = new Set();

  for (const item of array) {
    const itemCriterion = criterion(item);
    if (!seenCriteria.has(itemCriterion)) {
      uniqueItems.push(item);
      seenCriteria.add(itemCriterion);
    }
  }

  return uniqueItems;
}

function unique<T>(array: T[]): T[] {
  return uniqueBy(array, (x: T) => x);
}

/**
 * Convert a list of Tags in AWS format to an object with key/value.
 * @param tagList - an AWS-formatted list of tags
 * @param filterTags - (optional) a list of tag names to include, default to all tags
 * @returns a string:string object
 */
function makeResourceTags(tagList: any, filterTags?: string[]): { [key: string]: string } {
  if (tagList === undefined) {
    return {};
  }
  let useTagList = tagList;
  if (filterTags !== undefined) {
    useTagList = tagList.filter((tag: any) => filterTags.includes(tag.Key));
  }
  return useTagList.reduce((a: any, n: any) => Object.assign(a, { [n.Key]: n.Value }), {});
}

/**
 * Replace `%token` tokens in the given path with values from the Writer context, and date/time.
 * @param path - the string to be substituted
 * @returns a version of `path` with tokens replaced with their values; unmatched tokens will be retained as `%token`
 */
function resolveFilename(path?: string, context?: any): string {
  if (path === undefined) {
    return '';
  }
  // Replace all tokens from this.context
  let usePath = path;
  if (context && Object.keys(context).length) {
    const re = new RegExp(`%(${Object.keys(context).join('|')})`, 'g');
    usePath = usePath.replace(re, (match) => {
      const key = match.replace('%', '');
      // return context![key as keyof WriterContext] || '??';
      return context[key] || '??';
    });
  }
  // If filename contains any %xxx tokens (same character is repeated) attempt to use Luxon to resolve (date/time) tokens.
  usePath = usePath.replace(/%(\w)\1*(?!\w)/g, (match) => {
    return dateTime.getTime(context?.timezone).toFormat(match.replace('%', ''));
  });

  // unmatched tokens will be retained as `%token`
  return usePath;
}

export { paginateAwsCall, chunkArray, uniqueBy, unique, makeResourceTags, resolveFilename };
