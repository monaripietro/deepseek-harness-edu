export const DEFAULT_PROVIDER = { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };

export function resolveProvider(cfg) {
  return {
    label: cfg.label || DEFAULT_PROVIDER.label,
    baseUrl: (cfg.baseUrl || DEFAULT_PROVIDER.baseUrl).replace(/\/+$/, ''),
    model: cfg.model || DEFAULT_PROVIDER.model,
  };
}
