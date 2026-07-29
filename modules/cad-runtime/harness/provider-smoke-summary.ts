export interface ProviderSmokeSummaryInput {
  provider: string;
  authMethod: string;
  subscription?: string;
  resumed: boolean;
  sessionId?: string;
  response?: string;
  resumedResponse?: string;
  prompt?: string;
  environment?: unknown;
}

export function createProviderSmokeSummary(
  input: ProviderSmokeSummaryInput
) {
  return {
    provider: input.provider,
    authMethod: input.authMethod,
    subscription: input.subscription ?? null,
    resumed: input.resumed
  };
}
