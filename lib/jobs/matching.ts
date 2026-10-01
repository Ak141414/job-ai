import type { JobListing, ResumeProfile } from "@/lib/jobs/types";

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

export function rankJob(job: JobListing, profile: ResumeProfile): JobListing {
  const searchableText = normalize(`${job.title} ${job.summary ?? ""} ${job.company}`);
  const matchedSkills = profile.skills.filter((skill) => {
    const normalizedSkill = normalize(skill);
    return normalizedSkill.length > 1 && searchableText.includes(normalizedSkill);
  });
  const skillScore = profile.skills.length ? (matchedSkills.length / Math.min(profile.skills.length, 8)) * 60 : 0;
  const titleTokens = normalize(profile.title).split(" ").filter((token) => token.length > 2);
  const matchingTitleTokens = titleTokens.filter((token) => searchableText.includes(token));
  const titleScore = titleTokens.length ? (matchingTitleTokens.length / titleTokens.length) * 30 : 10;
  const remoteScore = profile.remotePreference && job.workMode?.toLowerCase() === profile.remotePreference.toLowerCase() ? 10 : 0;
  const matchScore = Math.max(1, Math.min(99, Math.round(skillScore + titleScore + remoteScore)));

  return { ...job, matchedSkills, matchScore };
}

export function rankJobs(jobs: JobListing[], profile: ResumeProfile) {
  return jobs
    .map((job) => rankJob(job, profile))
    .sort((first, second) => second.matchScore - first.matchScore || Date.parse(second.postedAt) - Date.parse(first.postedAt));
}
