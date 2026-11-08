'use strict';

const fs = require('fs');
const path = require('path');
const { renderAll } = require('../lib/sport-zone');

const root = path.join(__dirname, '..');
const { pages } = renderAll(root);
for (const page of pages) {
  fs.writeFileSync(path.join(root, page.file), page.html);
  console.log('wrote ' + page.file);
}
