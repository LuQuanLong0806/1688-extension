// e2e/setup.js — E2E 测试环境初始化
// 确保测试用户存在，确保测试数据隔离
// 运行: node e2e/setup.js
//
// 环境变量配置（密码不对时设置）:
//   set E2E_ADMIN_PWD=你的admin密码
//   set E2E_OPERATOR_PWD=运营密码
//   set E2E_OPERATOR_USER=运营用户名  (默认 suyu)
//   set E2E_VIEWER_PWD=只读密码
//   set E2E_VIEWER_USER=只读用户名   (默认 viewer)

const http = require('http');

const BASE = 'http://localhost:3000';

// 测试用户配置
function getTestUsers() {
  if (process.env.E2E_USERS) return JSON.parse(process.env.E2E_USERS);
  return [
    { username: 'admin',    password: process.env.E2E_ADMIN_PWD    || 'admin', role: 'admin',    display_name: '管理员' },
    { username: process.env.E2E_OPERATOR_USER || 'suyu', password: process.env.E2E_OPERATOR_PWD || 'suyu', role: 'operator', display_name: '运营' },
    { username: process.env.E2E_VIEWER_USER  || 'viewer', password: process.env.E2E_VIEWER_PWD  || 'viewer', role: 'viewer',  display_name: '只读' },
  ];
}

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAdminToken(password) {
  const res = await request('POST', '/api/login', { username: 'admin', password });
  if (res.status !== 200 || !res.data.token) throw new Error(`Admin login failed: ${res.status}`);
  return res.data.token;
}

async function checkUsers(TEST_USERS) {
  console.log('检查测试用户:');
  const validUsers = {};
  
  for (const user of TEST_USERS) {
    try {
      const loginRes = await request('POST', '/api/login', { username: user.username, password: user.password });
      if (loginRes.status === 200 && loginRes.data.token) {
        validUsers[user.username] = user;
        console.log(`  ✅ ${user.username} (${user.role}) 登录成功`);
      } else if (loginRes.status === 401) {
        console.log(`  ⚠️  ${user.username} (${user.role}) 密码错误`);
      } else if (loginRes.data && loginRes.data.must_change_password) {
        console.log(`  🔒 ${user.username} (${user.role}) 需要首次改密码`);
      } else {
        console.log(`  ❓ ${user.username} (${user.role}) 状态: ${loginRes.status}`);
      }
    } catch (e) {
      console.log(`  ❓ ${user.username} (${user.role}) 请求失败: ${e.message}`);
    }
  }
  
  return validUsers;
}

async function ensureUsers(token, TEST_USERS) {
  // 检查哪些用户还不存在
  const existing = await request('GET', '/api/users', null, token);
  if (existing.status !== 200) return;
  
  const existingNames = new Set(existing.data.map(u => u.username));
  
  for (const user of TEST_USERS) {
    if (existingNames.has(user.username)) continue;
    
    const createRes = await request('POST', '/api/users', {
      username: user.username,
      password: user.password,
      role: user.role,
      display_name: user.display_name,
    }, token);
    
    if (createRes.status === 200) {
      console.log(`  🆕 ${user.username} (${user.role}) 已创建`);
    } else {
      console.log(`  ⚠️  ${user.username} 创建失败: ${createRes.status}`);
    }
  }
}

async function cleanE2eData(token) {
  if (!token) return;
  console.log('\n清理 E2E 测试数据...');
  
  try {
    const listRes = await request('GET', '/api/product?pageSize=500&keyword=%5BE2E%5D', null, token);
    const products = listRes.data?.list || [];
    const e2eProducts = products.filter(p => (p.title || '').includes('[E2E]'));
    
    if (e2eProducts.length > 0) {
      const ids = e2eProducts.map(p => p.id);
      const delRes = await request('POST', '/api/product/batch-delete', { ids }, token);
      console.log(`  🗑️  清理了 ${e2eProducts.length} 条测试商品`);
    } else {
      console.log('  ✅ 无需清理');
    }
  } catch (e) {
    console.log(`  ⚠️  清理失败: ${e.message}`);
  }
}

async function main() {
  console.log('🔧 E2E 测试环境初始化\n');
  
  // 检查服务是否运行
  try {
    const health = await request('GET', '/api/extension-version');
    if (health.status === 200) console.log('✅ 服务运行中\n');
  } catch {
    console.error('❌ 无法连接到 localhost:3000，请先启动服务');
    process.exit(1);
  }
  
  const TEST_USERS = getTestUsers();
  const validUsers = await checkUsers(TEST_USERS);
  
  // 提示缺失配置
  const missingRoles = TEST_USERS.filter(u => !validUsers[u.username]);
  if (missingRoles.length > 0) {
    console.log('\n⚠️  以下角色需要配置密码:');
    missingRoles.forEach(u => {
      console.log(`   set E2E_${u.role.toUpperCase()}_PWD=<密码>`);
      if (u.role !== 'admin') console.log(`   set E2E_${u.role.toUpperCase()}_USER=<用户名>`);
    });
  }
  
  // 获取 admin token 来创建缺失用户
  const adminUser = validUsers['admin'];
  let token = null;
  try {
    token = await getAdminToken(adminUser.password);
    
    // 创建缺失的用户
    const missing = TEST_USERS.filter(u => !validUsers[u.username]);
    if (missing.length > 0 && token) {
      console.log('\n创建缺失用户:');
      await ensureUsers(token, missing);
    }
  } catch {
    console.log('\n⚠️  无法获取 admin token，跳过自动创建用户');
  }
  
  // 清理旧测试数据
  await cleanE2eData(token);
  
  const passedCount = Object.keys(validUsers).length;
  console.log(`\n${passedCount}/${TEST_USERS.length} 个用户已就绪`);
  if (passedCount < TEST_USERS.length) {
    console.log('⚠️  部分测试需要配置密码后才能运行');
  }
  console.log('运行: npx playwright test');
}

main().catch((e) => {
  console.error('Setup failed:', e.message);
  process.exit(1);
});
