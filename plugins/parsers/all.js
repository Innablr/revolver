const path = require('path');

function getParser(name) {
    const m = require(path.join(__dirname, name));
    return m;
}

module.exports = getParser;
