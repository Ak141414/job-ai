export type JobMarket = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
};

export const jobMarkets: JobMarket[] = [
  { code: "US", name: "United States", latitude: 39.8, longitude: -98.6 },
  { code: "GB", name: "United Kingdom", latitude: 54.2, longitude: -2.8 },
  { code: "IN", name: "India", latitude: 22.8, longitude: 79.0 },
  { code: "CA", name: "Canada", latitude: 56.1, longitude: -106.3 },
  { code: "AU", name: "Australia", latitude: -25.3, longitude: 133.8 },
  { code: "DE", name: "Germany", latitude: 51.2, longitude: 10.4 },
  { code: "FR", name: "France", latitude: 46.2, longitude: 2.2 },
  { code: "NL", name: "Netherlands", latitude: 52.1, longitude: 5.3 },
  { code: "SG", name: "Singapore", latitude: 1.35, longitude: 103.8 },
  { code: "JP", name: "Japan", latitude: 36.2, longitude: 138.3 },
  { code: "BR", name: "Brazil", latitude: -10.8, longitude: -52.9 },
  { code: "AE", name: "United Arab Emirates", latitude: 24.2, longitude: 54.3 },
  { code: "ZA", name: "South Africa", latitude: -30.6, longitude: 22.9 },
  { code: "IE", name: "Ireland", latitude: 53.1, longitude: -8.0 },
  { code: "NZ", name: "New Zealand", latitude: -41.0, longitude: 174.0 },
];
