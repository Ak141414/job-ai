export type ResumeProfile = {
  title: string;
  skills: string[];
  experienceYears: number | null;
  locations: string[];
  remotePreference: string | null;
};

export type JobListing = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: string | null;
  postedAt: string;
  summary: string | null;
  applicationUrl: string;
  countryCode: string;
  matchScore: number;
  matchedSkills: string[];
  source?: "Remotive" | "Jobicy" | "Arbeitnow" | "ArbeitnowUK" | "Himalayas" | "RemoteOK" | "RemoteJobsOrg" | "RemoteFirstJobs" | "WorkingNomads" | "Greenhouse" | "Lever" | "Ashby" | "SmartRecruiters";
  countryCodes?: string[];
};

export type JobMarketSummary = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  count: number;
};