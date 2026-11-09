'use strict';

const fs = require('fs');
const path = require('path');
const { renderAll, renderRacquetsIndex } = require('../lib/sport-zone');

const root = path.join(__dirname, '..');
const { pages, family } = renderAll(root);
for (const page of pages) {
  fs.writeFileSync(path.join(root, page.file), page.html);
  console.log('wrote ' + page.file);
}
fs.writeFileSync(path.join(root, 'racquets.html'), renderRacquetsIndex(family, pages));
console.log('wrote racquets.html');
