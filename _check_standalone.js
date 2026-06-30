const fs = require('fs');
const html = fs.readFileSync('E:/jinrongdata/dsmm-tool-app/preview-v3-standalone.html', 'utf8');
console.log('size:', html.length);
console.log('panel-ref id:', html.includes('id="panel-ref"'));
console.log('panel-ref-close id:', html.includes('id="panel-ref-close"'));
console.log('fixed positioning:', html.includes('position: fixed'));
console.log('hideFloatingPanel fn:', html.includes('hideFloatingPanel'));
console.log('showFloatingPanel fn:', html.includes('showFloatingPanel'));