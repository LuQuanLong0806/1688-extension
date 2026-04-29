const fs = require('fs');
let c = fs.readFileSync('server/public/js/components/detail-modal.js', 'utf8');

// Find the exact closing pattern after the status tag
const oldPart = "已使用\\' }}</span>\\\n              </span>\\\n            </span>";
const idx = c.indexOf("已使用\\' }}</span>");
if (idx === -1) { console.log('pattern not found'); process.exit(1); }

// Get context around it
const start = c.lastIndexOf("status-tag", idx);
const end = c.indexOf("</span>", idx + 30) + "</span>".length;
const end2 = c.indexOf("</span>", end + 1) + "</span>".length;
console.log('Found at index', idx, 'replacing range', start, '-', end2);
console.log('Old text:', JSON.stringify(c.substring(start, end2)));

const newBlock =
  "status-tag \\' + (editable.status === 0 ? \\'status-unused\\' : \\'status-used\\')\" style=\"cursor:pointer\" @click=\"toggleStatus\">\\\n" +
  "                {{ editable.status === 0 ? \\'未使用\\' : \\'已使用\\' }}</span>\\\n" +
  "                <i-button size=\"small\" :type=\"editable.status === 0 ? \\'success\\' : \\'error\\'\" @click=\"toggleStatus\" style=\"margin-left:8px\">{{ editable.status === 0 ? \\'标记已使用\\' : \\'标记未使用\\' }}</i-button>\\\n" +
  "            </span>";

c = c.substring(0, start) + newBlock + c.substring(end2);
fs.writeFileSync('server/public/js/components/detail-modal.js', c, 'utf8');
console.log('done');
