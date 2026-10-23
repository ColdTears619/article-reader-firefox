export class ProviderConfigurationError extends Error {
  readonly needsSettings = true;

  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}
