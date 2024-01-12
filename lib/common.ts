async function paginateAwsCall(fn: (...args: any[]) => any, what: string, params?: any) {
  let entityList: any[] = [];
  const parameters = params || {};
  let r = await fn(parameters).promise();
  entityList = entityList.concat(entityList, r[what]);
  while (r.NextToken !== undefined) {
    r = await fn(Object.assign({}, parameters, { NextToken: r.NextToken })).promise();
    entityList = entityList.concat(r[what]);
  }
  return entityList;
}

function chunkArray<T>(arr: T[], len: number): T[][] {
  const chunks = [];
  let i = 0;
  const n = arr.length;
  while (i < n) {
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

export { paginateAwsCall, chunkArray, uniqueBy };
