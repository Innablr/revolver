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
  if (filterTags !== undefined) {
    tagList = tagList.filter((tag: any) => filterTags.includes(tag.Key));
  }
  return tagList.reduce((a: any, n: any) => Object.assign(a, { [n.Key]: n.Value }), {});
}

export { paginateAwsCall, chunkArray, uniqueBy, unique, makeResourceTags };
