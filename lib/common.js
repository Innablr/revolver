const AWS = require('aws-sdk');

class CommonFunctions {
    async paginateAwsCall(fn, what, params) {
        let entityList = [];
        const parameters = params || {};
        let r = await fn(parameters).promise();
        entityList = entityList.concat(entityList, r[what]);
        while (r.NextToken !== undefined) {
                r = await fn(Object.assign({}, parameters, {NextToken: r.NextToken})).promise();
                entityList = entityList.concat(r[what]);
        }
        return entityList;
    }

    chunkArray(arr, len) {
        var chunks = [],
            i = 0,
            n = arr.length;
        while (i < n) {
          chunks.push(arr.slice(i, i += len));
        }
        return chunks;
    }
}
module.exports = new CommonFunctions();
