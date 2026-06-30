const fs = require('fs');
const html = fs.readFileSync('E:/jinrongdata/dsmm-tool-app/preview-v3-standalone.html', 'utf8');
const matches = [...html.matchAll(/id="panel-ref"/g)];
console.log('panel-ref id count:', matches.length);
matches.forEach(m => console.log(' at', m.index, ':', html.slice(Math.max(0, m.index-50), m.index+50)));

console.log('---');
// Find <body> content
const bodyStart = html.indexOf('<body>');
const bodyEnd = html.indexOf('</body>');
const bodyContent = html.slice(bodyStart, bodyEnd);
console.log('body content length:', bodyContent.length);

// Count script tags in body
const scriptMatches = [...bodyContent.matchAll(/<script>/g)];
console.log('script tags in body:', scriptMatches.length);

// Find what's between bodyStart and first <script>
const firstScript = bodyContent.indexOf('<script>');
console.log('--- HTML between <body> and first <script> ---');
console.log(bodyContent.slice(0, firstScript));
console.log('--- length of HTML between body and first script:', firstScript);