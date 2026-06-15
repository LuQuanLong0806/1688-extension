const SQL = require('sql.js');
const fs = require('fs');

(async () => {
  const sql = await SQL();
  const buf = fs.readFileSync('F:\\00_project\\1688-extension\\server\\data.db');
  const db = new sql.Database(buf);
  const s = db.prepare('SELECT username, role, disabled, length(password_hash) as hlen, display_name FROM users');
  while (s.step()) {
    const r = s.getAsObject();
    console.log(`${r.username} | role=${r.role} | disabled=${r.disabled} | hashLen=${r.hlen} | name=${r.display_name}`);
  }
  s.free();
  db.close();
})().catch(e => console.error(e.message));
