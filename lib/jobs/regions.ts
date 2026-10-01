export const regionCountryCodes = {
  Americas: [
    "AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE",
  ],
  Africa: [
    "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW",
  ],
  Asia: [
    "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "KR", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE",
  ],
  Europe: [
    "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "VA", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB",
  ],
  Oceania: [
    "AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "TV", "KI", "NR", "PW", "FM", "MH",
  ],
} as const;

export type RegionName = keyof typeof regionCountryCodes;
export const regions = Object.keys(regionCountryCodes) as RegionName[];