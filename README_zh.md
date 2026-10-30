# IDaaS Alibaba Cloud Credentials Adapter

简体中文 | [English](README.md)

将 IDaaS PAM 临时凭证用于阿里云 OpenAPI、OSS 和 SLS 客户端。

## 环境与安装

支持 Node.js 20、22、24，JavaScript CommonJS/ESM 以及 TypeScript 4.7 及以上版本。本 SDK 用于 Node.js，不用于浏览器。请以 npm registry 中的实际可用版本为准；评估尚未发布的版本时，使用提供的安装包归档。

```sh
npm install @cloud-idaas/core-sdk @cloud-idaas/akless-alibabacloud-adapter
```

## 使用

通过 CLOUD_IDAAS_CONFIG_PATH 或 ~/.cloud_idaas/client-config.json 配置 Core，提供 developerApiEndpoint 及已获 PAM 访问授权的身份，并替换示例标识。 将以下 ESM 示例保存为 `example.mjs`，通过 Node.js 运行。CommonJS 使用相同的具名导出和 `require`，异步调用放在 async 函数中。

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

## 集成说明

阿里云 OpenAPI 客户端使用 `toAlibabaCloudCredential()`，OSS 使用 `getOSSOptions()`，SLS 使用提供者的 `getCredentials()` 集成入口。请另行安装应用需要的官方服务客户端。

OSS 应使用返回的可刷新配置，不要长期保存一次性凭证快照。服务请求完成前保持提供者可用，随后关闭其自有资源；调用方传入的提供者和客户端仍由调用方管理。

配置对象支持 `roleExternalId`、`developerApiEndpoint`、`idaasInstanceId` 和 `credentialProvider`。`httpConfiguration.userAgent` 定制发往 IDaaS 的请求；云服务请求遵循其官方客户端配置。

## 示例与支持

[examples](examples) 提供 CommonJS、ESM 和 TypeScript 示例。问题反馈请使用 [GitHub Issues](https://github.com/cloud-idaas/idaas-typescript-akless-alibabacloud-adapter/issues)，开发说明见源码仓库的[贡献指南](https://github.com/cloud-idaas/idaas-typescript-akless-alibabacloud-adapter/blob/master/CONTRIBUTING.md)。

## 许可证

[Apache License 2.0](LICENSE)。
