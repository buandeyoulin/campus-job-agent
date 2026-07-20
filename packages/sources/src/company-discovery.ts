export interface CompanyDiscoveryResult {
  query: string;
  title: string;
  url: string;
  snippet: string;
}

export interface CompanyDiscoveryProvider {
  discover(queries: readonly string[]): Promise<CompanyDiscoveryResult[]>;
}

export const DEFAULT_COMPANY_DISCOVERY_QUERIES = [
  "数字芯片 公司 校园招聘 官网",
  "IC验证 公司 校园招聘 官网",
  "半导体设备 公司 招聘 官网",
  "EDA 公司 校园招聘 官网",
  "晶圆制造 公司 校园招聘 官网",
] as const;
