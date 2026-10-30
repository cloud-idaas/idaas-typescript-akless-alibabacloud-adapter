import { strict as assert } from 'node:assert';
import { IDaaSPamAlibabaCloudCredentialsProvider } from '../src';

describe('Beta regression: expiration and closure checks before cloud credential delivery', () => {
  it('rejects delivery when credentials expire or the provider closes during the outer await', async () => {
    for (const transition of ['expire', 'close']) {
      for (const entry of ['oss-initial', 'oss-refresh']) {
        let now = Date.now();
        const expiresAt = now + 3600000;
        const expiration = new Date(expiresAt).toISOString();
        const source = new IDaaSPamAlibabaCloudCredentialsProvider({
          roleExternalId: 'role',
          cache: { clock: () => now, logger: { info() {}, warn() {}, error() {} } },
          pamClient: {
            async obtainAccessCredential() {
              return {
                alibabaCloudStsToken: {
                  accessKeyId: 'id',
                  accessKeySecret: 'key',
                  securityToken: 'session',
                  expiration,
                },
              };
            },
          },
        });
        try {
          const valid = await source.getCredentials();
          const read =
            entry === 'oss-initial'
              ? () => source.getOSSOptions()
              : (await source.getOSSOptions()).refreshSTSToken;
          // Replace only the public credential source to isolate delivery races after the final await.
          source.getCredentials = async () => {
            queueMicrotask(() => {
              if (transition === 'close') source.close();
              else now = expiresAt;
            });
            return { ...valid };
          };
          await assert.rejects(read(), {
            errorCode: transition === 'close' ? 'Closed' : 'InvalidExpiration',
          });
        } finally {
          source.close();
        }
      }
    }
  });
});
