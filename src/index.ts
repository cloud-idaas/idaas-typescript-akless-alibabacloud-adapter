import Credential from '@alicloud/credentials';
import { CredentialException } from '@cloud-idaas/core-sdk';
import {
  type AklessProviderOptions,
  AklessProviderBuilder,
  CachedCloudCredentialProvider,
  type ExpiringCredential,
  credentialExpiration,
  credentialString,
} from '@cloud-idaas/pam-client-sdk';

/** Alibaba Cloud STS snapshot; inherited expiration is ISO 8601. Never log secret fields. */
export interface AlibabaSessionCredentials extends ExpiringCredential {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  providerName: string;
}
/** Temporary credentials accepted by ali-oss; securityToken maps to stsToken at this boundary. */
export interface OSSSTSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  stsToken: string;
}
/**
 * Initialization and refresh options verified with ali-oss 6.23.0; do not include an OSS service instance.
 * @remarks Initial fields are snapshots; refreshSTSToken reads the provider again. Call close after use.
 */
export interface OSSCredentialOptions extends OSSSTSCredentials {
  /** Returns a valid STS snapshot; rejects when refresh fails and cached credentials have expired. */
  refreshSTSToken: () => Promise<OSSSTSCredentials>;
  /** Refresh interval checked before OSS requests, in milliseconds. */
  refreshSTSTokenInterval: number;
  /** Closes the underlying IDaaS provider, leaving the caller-owned OSS client and shared injected resources open. */
  close(): void;
}
/**
 * Retrieves Alibaba Cloud STS through PAM for Credentials, SLS, and OSS integrations.
 * @remarks Supports Node.js 20/22/24; interfaces checked against @alicloud/credentials 2.4.7, ali-oss 6.23.0,
 * and @alicloud/log 1.2.6. Inherited getCredentials returns independent snapshots; close releases only owned
 * PAM/HTTP resources, leaving injected PAM, HTTP, and machine credential sources open.
 */
export class IDaaSPamAlibabaCloudCredentialsProvider extends CachedCloudCredentialProvider<AlibabaSessionCredentials> {
  /**
   * Creates a fluent builder without I/O; retrieval starts on first use after build.
   * @returns A builder for the role, endpoints, and injected sources.
   */
  static builder(): AklessProviderBuilder<IDaaSPamAlibabaCloudCredentialsProvider> {
    return new AklessProviderBuilder(
      (options) => new IDaaSPamAlibabaCloudCredentialsProvider(options),
    );
  }
  /**
   * Creates an independent STS provider for a role without immediately fetching credentials.
   * @param options - Required role and optional PAM, HTTP, machine credential source, and cache options.
   * @throws ConfigException - The role or configuration is invalid, or the default factory required for missing options is not initialized.
   */
  constructor(options: AklessProviderOptions) {
    super(options, (response) => {
      const token = response.alibabaCloudStsToken;
      if (!token)
        throw new CredentialException(
          'Response is missing alibabaCloudStsToken',
          'InvalidCredentialResponse',
        );
      return {
        accessKeyId: credentialString(token.accessKeyId, 'accessKeyId'),
        accessKeySecret: credentialString(token.accessKeySecret, 'accessKeySecret'),
        securityToken: credentialString(token.securityToken, 'securityToken'),
        expiration: new Date(credentialExpiration(response, token.expiration)).toISOString(),
        providerName: 'idaas_pam',
      };
    });
  }
  /** @returns The stable source identifier idaas_pam used by the official Credentials Provider protocol. */
  getProviderName(): string {
    return 'idaas_pam';
  }
  /**
   * Wraps this dynamic provider in an official @alicloud/credentials 2.4.7 client.
   * @returns An official Credential instance sharing the IDaaS cache; callers must still close this provider.
   */
  toAlibabaCloudCredential(): Credential {
    return new Credential(null, this);
  }
  /**
   * Retrieves a credential snapshot and an asynchronous refresh callback for ali-oss initialization.
   * @returns Options with a refresh interval in milliseconds and close; close also closes this provider.
   * @throws IDaaSException - PAM requests, credential parsing, or refresh fail without usable unexpired cached credentials.
   */
  async getOSSOptions(): Promise<OSSCredentialOptions> {
    const convert = (value: AlibabaSessionCredentials): OSSSTSCredentials => ({
      accessKeyId: value.accessKeyId,
      accessKeySecret: value.accessKeySecret,
      stsToken: value.securityToken,
    });
    const value = await this.getCredentials();
    this.assertAvailable(value);
    return {
      ...convert(value),
      close: () => this.close(),
      refreshSTSToken: async () => {
        const refreshed = await this.getCredentials();
        this.assertAvailable(refreshed);
        return convert(refreshed);
      },
      refreshSTSTokenInterval: Math.max(
        1,
        Math.min(300_000, Math.floor((Date.parse(value.expiration) - Date.now()) / 6)),
      ),
    };
  }
}
/**
 * Creates an Alibaba Cloud/SLS dynamic credential provider without immediately fetching STS credentials.
 * @param roleOrOptions - Role external ID or complete configuration including the role.
 * @param options - Additional configuration when the first argument is a string; injected sources take precedence over the default factory.
 * @returns An independent provider; callers must call close after use to release only owned resources.
 * @throws ConfigException - The role or configuration is invalid, or the required default factory is not initialized.
 */
export function createAlibabaCloudCredentialsProvider(
  roleOrOptions: string | AklessProviderOptions,
  options: Omit<AklessProviderOptions, 'roleExternalId'> = {},
): IDaaSPamAlibabaCloudCredentialsProvider {
  return new IDaaSPamAlibabaCloudCredentialsProvider(
    typeof roleOrOptions === 'string'
      ? { ...options, roleExternalId: roleOrOptions }
      : roleOrOptions,
  );
}
/** Alibaba Cloud beta adapter factories; do not create or manage OSS/SLS service clients. */
export class IDaaSPamAklessCredentialFactory {
  /** Convenience provider factory with the same arguments, lifecycle, and errors as the named factory. */
  static createAlibabaCloudCredentialsProvider = createAlibabaCloudCredentialsProvider;
  /** getCredentials integration for @alicloud/log 1.2.6; callers must close the returned provider. */
  static createSLSCredentialsProvider = createAlibabaCloudCredentialsProvider;
  /**
   * Creates an independent provider and retrieves ali-oss initialization and refresh options.
   * @param roleOrOptions - Role external ID or complete configuration.
   * @param options - Additional configuration when the role is a string.
   * @returns Options with initial STS credentials and refreshSTSToken; call the returned close after use.
   * @throws IDaaSException - The configuration is invalid or the initial STS request fails.
   */
  static async createOSSCredentialOptions(
    roleOrOptions: string | AklessProviderOptions,
    options: Omit<AklessProviderOptions, 'roleExternalId'> = {},
  ): Promise<OSSCredentialOptions> {
    const provider = createAlibabaCloudCredentialsProvider(roleOrOptions, options);
    try {
      return await provider.getOSSOptions();
    } catch (error) {
      provider.close();
      throw error;
    }
  }
}
