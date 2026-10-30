import { strict as assert } from 'node:assert';
import { IDaaSPamAklessCredentialFactory, IDaaSPamAlibabaCloudCredentialsProvider } from '../src';
import { createServer } from 'node:http';

const quiet = { info() {}, warn() {}, error() {} };
describe('Alibaba Cloud dynamic credential interfaces', () => {
  it('closes the new provider after initial OSS retrieval fails while preserving shared injected PAM/HTTP', async () => {
    let providerCloses = 0;
    let sharedPamCloses = 0;
    let sharedHttpCloses = 0;
    const sharedPam = {
      async obtainAccessCredential() {
        throw new Error('test failure');
      },
      close() {
        sharedPamCloses++;
      },
    };
    const sharedHttp = {
      async send() {
        throw new Error('test failure');
      },
      close() {
        sharedHttpCloses++;
      },
    };
    const originalClose = IDaaSPamAlibabaCloudCredentialsProvider.prototype.close;
    IDaaSPamAlibabaCloudCredentialsProvider.prototype.close = function (
      this: IDaaSPamAlibabaCloudCredentialsProvider,
    ): void {
      providerCloses++;
      originalClose.call(this);
    };
    try {
      await assert.rejects(
        IDaaSPamAklessCredentialFactory.createOSSCredentialOptions({
          roleExternalId: 'role',
          cache: { logger: quiet },
          pamClient: sharedPam,
        }),
      );
      await assert.rejects(
        IDaaSPamAklessCredentialFactory.createOSSCredentialOptions({
          roleExternalId: 'role',
          developerApiEndpoint: 'https://example.invalid',
          idaasInstanceId: 'instance',
          credentialProvider: {
            async getAccessToken() {
              return 'access-token';
            },
            async getCredential() {
              return {
                accessToken: 'access-token',
                tokenType: 'Bearer',
                expiresIn: 3600,
                expiresAt: Date.now() / 1000 + 3600,
              };
            },
          },
          httpClient: sharedHttp,
          cache: { logger: quiet },
        }),
      );
      assert.equal(providerCloses, 2);
      assert.equal(sharedPamCloses, 0);
      assert.equal(sharedHttpCloses, 0);
    } finally {
      IDaaSPamAlibabaCloudCredentialsProvider.prototype.close = originalClose;
    }
  });
  it('uses STS and refresh callbacks to sign local requests with a real ali-oss client', async () => {
    let token = '';
    const server = createServer((req, res) => {
      token = String(req.headers['x-oss-security-token'] || '');
      assert(String(req.headers.authorization || '').includes('ak:'));
      res.setHeader('connection', 'close');
      res.setHeader('content-type', 'application/xml');
      res.end(
        '<ListBucketResult><Name>test-bucket</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object');
    const provider = new IDaaSPamAlibabaCloudCredentialsProvider({
      roleExternalId: 'role',
      cache: { logger: quiet },
      pamClient: {
        async obtainAccessCredential() {
          return {
            alibabaCloudStsToken: {
              accessKeyId: 'ak',
              accessKeySecret: 'sk',
              securityToken: 'sts',
              expiration: new Date(Date.now() + 3600_000).toISOString(),
            },
          };
        },
      },
    });
    const OSS = require('ali-oss') as new (options: object) => {
      list(options: object): Promise<unknown>;
    };
    try {
      const client = new OSS({
        ...(await provider.getOSSOptions()),
        endpoint: `http://127.0.0.1:${address.port}`,
        cname: true,
        bucket: 'test-bucket',
        region: 'oss-cn-hangzhou',
        secure: false,
      });
      await client.list({ 'max-keys': 1 });
      assert.equal(token, 'sts');
    } finally {
      provider.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('supports real official Credential clients and the SLS getCredentials integration', async () => {
    let calls = 0;
    const provider = new IDaaSPamAlibabaCloudCredentialsProvider({
      roleExternalId: 'role',
      cache: { logger: quiet },
      pamClient: {
        async obtainAccessCredential() {
          calls++;
          return {
            alibabaCloudStsToken: {
              accessKeyId: 'ak',
              accessKeySecret: 'sk',
              securityToken: 'sts',
              expiration: new Date(Date.now() + 3600_000).toISOString(),
            },
          };
        },
      },
    });
    const client = provider.toAlibabaCloudCredential();
    assert.equal((await client.getCredential()).securityToken, 'sts');
    assert.equal(await client.getAccessKeyId(), 'ak');
    assert.equal((await provider.getCredentials()).accessKeySecret, 'sk');
    assert.equal(calls, 1);
    provider.close();
    await assert.rejects(client.getCredential());
  });
  it('maps stsToken for initial OSS credentials and refresh callbacks with a shared, closable cache', async () => {
    let calls = 0;
    const provider = new IDaaSPamAlibabaCloudCredentialsProvider({
      roleExternalId: 'role',
      cache: { logger: quiet },
      pamClient: {
        async obtainAccessCredential() {
          calls++;
          return {
            accessCredentialExpiresAt: Date.now() / 1000 + 3600,
            alibabaCloudStsToken: {
              accessKeyId: 'ak',
              accessKeySecret: 'sk',
              securityToken: 'sts',
            },
          };
        },
      },
    });
    const options = await provider.getOSSOptions();
    assert.equal(options.stsToken, 'sts');
    assert.equal((await options.refreshSTSToken()).stsToken, 'sts');
    assert(options.refreshSTSTokenInterval > 0);
    assert.equal(calls, 1);
    options.close();
    await assert.rejects(options.refreshSTSToken());
  });
});
