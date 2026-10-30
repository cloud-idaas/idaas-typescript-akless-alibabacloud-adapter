# IDaaS Alibaba Cloud Credentials Adapter

[Simplified Chinese](README_zh.md) | English

Use IDaaS PAM temporary credentials with Alibaba Cloud OpenAPI, OSS, and SLS clients.

## Requirements and installation

Supports Node.js 20, 22, and 24, JavaScript CommonJS/ESM, and TypeScript 4.7 or later. This is a Node.js SDK, not a browser SDK. Check your registry for available beta versions; use a provided package archive when evaluating an unreleased version.

```sh
npm install @cloud-idaas/core-sdk @cloud-idaas/akless-alibabacloud-adapter
```

## Usage

Configure Core using CLOUD_IDAAS_CONFIG_PATH or ~/.cloud_idaas/client-config.json. Provide developerApiEndpoint and an identity authorized for PAM access. Replace example identifiers with your settings. Save the following ESM example as `example.mjs` and run it with Node.js. CommonJS uses the same named exports through `require`; asynchronous calls belong inside an async function.

```javascript
import { IDaaSCredentialProviderFactory } from '@cloud-idaas/core-sdk';
import { createAlibabaCloudCredentialsProvider } from '@cloud-idaas/akless-alibabacloud-adapter';

await IDaaSCredentialProviderFactory.init();
try {
  const credentials = createAlibabaCloudCredentialsProvider('role-external-id');
  try {
    const officialCredential = credentials.toAlibabaCloudCredential();
    await officialCredential.getCredential();
    // Pass officialCredential to the OpenAPI Config credential field.
    const ossOptions = await credentials.getOSSOptions();
    // Pass ossOptions to new OSS({ ...ossOptions, region: '...', bucket: '...' }).
    // SLS uses new SLS({ credentialsProvider: credentials, region: '...' }).
    // Await all service requests before closing the provider.
  } finally {
    credentials.close();
  }
} finally {
  await IDaaSCredentialProviderFactory.close();
}
```

## Integration notes

Use `toAlibabaCloudCredential()` for Alibaba Cloud OpenAPI clients, `getOSSOptions()` for OSS, or the provider's `getCredentials()` integration for SLS. Install the official service client needed by your application separately.

For OSS, use the returned refresh-capable options instead of storing a one-time credential snapshot. Keep the provider open until service requests finish, then close its owned resources. Caller-supplied providers and clients remain caller-owned.

The options object accepts `roleExternalId`, `developerApiEndpoint`, `idaasInstanceId`, and `credentialProvider`. `httpConfiguration.userAgent` customizes requests to IDaaS; cloud-service requests follow their official client's configuration.

## Examples and support

See [examples](examples) for CommonJS, ESM, and TypeScript samples. Report issues through [GitHub Issues](https://github.com/cloud-idaas/idaas-typescript-akless-alibabacloud-adapter/issues). Development instructions are in the repository's [contribution guide](https://github.com/cloud-idaas/idaas-typescript-akless-alibabacloud-adapter/blob/master/CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE).
