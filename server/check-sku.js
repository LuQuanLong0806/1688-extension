const Database = require('sql.js');
const fs = require('fs');
const buf = fs.readFileSync('F:/00_project/1688-extension/server/data.db');
Database().then(db => {
  const total = db.exec("SELECT COUNT(*) FROM products")[0].values[0][0];
  const withSku = db.exec("SELECT COUNT(*) FROM products WHERE sku_list IS NOT NULL AND sku_list != '[]' AND sku_list != ''")[0].values[0][0];
  const withVariant = db.exec("SELECT COUNT(*) FROM products WHERE variant_attrs IS NOT NULL AND variant_attrs != '[]' AND variant_attrs != ''")[0].values[0][0];
  console.log('Total products:', total);
  console.log('With SKU:', withSku);
  console.log('With variant_attrs:', withVariant);
  
  // Get one product with SKU
  if (withSku > 0) {
    const sample = db.exec("SELECT uid, title, substr(sku_list, 1, 200), substr(variant_attrs, 1, 200) FROM products WHERE sku_list IS NOT NULL AND sku_list != '[]' LIMIT 1");
    if (sample[0]) {
      console.log('Sample:', JSON.stringify(sample[0].values[0]));
    }
  }
  
  db.close();
});
