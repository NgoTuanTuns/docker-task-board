const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Compose keeps app replicas private and publishes only Nginx', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const appBlock = compose.split(/^  app:\s*$/m)[1].split(/^  nginx:\s*$/m)[0];
  const nginxBlock = compose.split(/^  nginx:\s*$/m)[1].split(/^volumes:\s*$/m)[0];
  assert.doesNotMatch(appBlock, /^\s+ports:/m);
  assert.match(nginxBlock, /ports:/);
  assert.match(compose, /condition: service_healthy/);
});

test('Nginx configuration supports dynamic Docker DNS and WebSocket upgrades', () => {
  const nginx = fs.readFileSync(path.join(root, 'nginx', 'default.conf'), 'utf8');
  assert.match(nginx, /resolver 127\.0\.0\.11/);
  assert.match(nginx, /server app:3000 resolve/);
  assert.match(nginx, /proxy_http_version 1\.1/);
  assert.match(nginx, /proxy_set_header Upgrade/);
  assert.match(nginx, /proxy_set_header Connection \$connection_upgrade/);
});

test('Socket.IO Redis adapter dependencies are declared', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@socket.io/redis-adapter']);
  assert.ok(pkg.dependencies.redis);
});
