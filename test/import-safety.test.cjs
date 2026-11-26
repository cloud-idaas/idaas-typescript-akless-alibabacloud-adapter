const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('mocha');

describe('Package import', () => {
  for (const mode of ['require', 'import']) {
    it(`does not access a synthetic identity value during ${mode}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idaas-ali-import-'));
      try {
        const scope = path.join(root, 'node_modules', '@cloud-idaas');
        const adapter = path.join(scope, 'akless-alibabacloud-adapter');
        fs.mkdirSync(adapter, { recursive: true });
        fs.cpSync(path.join(__dirname, '..', 'dist'), path.join(adapter, 'dist'), {
          recursive: true,
        });
        fs.copyFileSync(
          path.join(__dirname, '..', 'package.json'),
          path.join(adapter, 'package.json'),
        );
        for (const [name, source] of [
          ['core-sdk', 'exports.CredentialException = class extends Error {};'],
          [
            'pam-client-sdk',
            'exports.CachedCloudCredentialProvider = class {}; exports.AklessProviderBuilder = class {};',
          ],
        ]) {
          const target = path.join(scope, name);
          fs.mkdirSync(target, { recursive: true });
          fs.writeFileSync(path.join(target, 'index.js'), source);
        }
        const script = `
          const key = 'AWS_SECRET_ACCESS_KEY';
          const original = process.env;
          let reads = 0;
          const observed = new Proxy(original, {
            get(target, name, receiver) {
              if (name === key) reads++;
              return Reflect.get(target, name, receiver);
            },
            getOwnPropertyDescriptor(target, name) {
              if (name === key) reads++;
              return Reflect.getOwnPropertyDescriptor(target, name);
            },
          });
          process.env = observed;
          (async () => {
            const entry = ${mode === 'require' ? "require('@cloud-idaas/akless-alibabacloud-adapter')" : "await import('@cloud-idaas/akless-alibabacloud-adapter')"};
            if (typeof entry.IDaaSPamAlibabaCloudCredentialsProvider !== 'function' || process.env !== observed)
              throw new Error('Package or environment observer is unavailable');
            process.stdout.write(JSON.stringify({ reads }));
          })().catch(() => { process.exitCode = 1; });
        `;
        const result = spawnSync(process.execPath, ['-e', script], {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            HOME: root,
            NODE_PATH: path.join(__dirname, '..', 'node_modules'),
            AWS_SECRET_ACCESS_KEY: 'synthetic',
          },
          encoding: 'utf8',
          timeout: 10000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).reads, 0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
