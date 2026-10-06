import { isRecord } from "@/lib/providers/server";
import type { JobListing } from "@/lib/jobs/types";

type FeedName =
  | "Remotive"
  | "Jobicy"
  | "Arbeitnow"
  | "ArbeitnowUK"
  | "Himalayas"
  | "RemoteOK"
  | "RemoteJobsOrg"
  | "RemoteFirstJobs"
  | "WorkingNomads"
  | "Greenhouse"
  | "Lever"
  | "Ashby"
  | "SmartRecruiters";

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function detectWorkMode(
  title: string,
  location: string,
  description: string,
  source: FeedName,
  job: Record<string, unknown>
): "Remote" | "Hybrid" | "Office" {
  if (source === "Arbeitnow" || source === "ArbeitnowUK") {
    if (job.remote === true) return "Remote";
    const details = `${title} ${location} ${description}`;
    return /\bhybrid\b/i.test(details) ? "Hybrid" : "Office";
  }

  if (source === "Ashby") {
    if (job.isRemote === true || /remote/i.test(text(job.workplaceType))) return "Remote";
    if (/hybrid/i.test(text(job.workplaceType))) return "Hybrid";
    return "Office";
  }

  if (source === "SmartRecruiters" && isRecord(job.location)) {
    if (job.location.remote === true) return "Remote";
  }

  if (source === "Lever") {
    const workplace = text(job.workplaceType).toLowerCase();
    if (workplace.includes("remote")) return "Remote";
    if (workplace.includes("hybrid")) return "Hybrid";
    if (workplace.includes("on-site") || workplace.includes("onsite")) return "Office";
  }

  const details = `${title} ${location} ${description}`.toLowerCase();
  if (/\bhybrid\b/.test(details)) return "Hybrid";
  if (/\b(remote|work from home|wfh|work-from-home|fully remote|100% remote)\b/.test(details)) {
    return "Remote";
  }
  if (
    /\b(on[- ]?site|office|wfo|work from office|in[- ]office|warehouse|clinic|store|branch|plant|field|hospital|retail|lab|hotel|flight|restaurant)\b/.test(
      details
    )
  ) {
    return "Office";
  }

  return "Remote";
}

function normalizeJob(job: Record<string, unknown>, source: FeedName): JobListing | null {
  let rawId: unknown;
  if (source === "Arbeitnow" || source === "ArbeitnowUK") rawId = job.slug;
  else if (source === "Himalayas") rawId = job.guid ?? job.applicationLink;
  else if (source === "RemoteJobsOrg") rawId = job.id;
  else if (source === "RemoteFirstJobs") rawId = job.id;
  else if (source === "WorkingNomads") {
    const url = text(job.url);
    const match = url.match(/\/(\d+)\/?$/);
    rawId = match?.[1] ?? job.url;
  } else if (source === "Greenhouse") rawId = job.id ?? job.internal_job_id;
  else if (source === "Lever") rawId = job.id;
  else if (source === "Ashby") rawId = job.id ?? job.jobId;
  else if (source === "SmartRecruiters") rawId = job.uuid ?? job.id;
  else rawId = job.id ?? job.job_id;

  const id = typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : text(rawId);

  const title = text(
    source === "Jobicy"
      ? job.jobTitle
      : source === "RemoteOK"
        ? job.position
        : source === "Lever"
          ? job.text
          : source === "SmartRecruiters"
            ? job.name
            : job.title
  );

  const company = text(
    source === "Jobicy" || source === "Himalayas"
      ? job.companyName
      : source === "RemoteOK"
        ? job.company
        : source === "RemoteJobsOrg"
          ? isRecord(job.company)
            ? job.company.name
            : ""
          : source === "RemoteFirstJobs" || source === "WorkingNomads"
            ? job.company_name
            : source === "Greenhouse" ||
                source === "Lever" ||
                source === "Ashby" ||
                source === "SmartRecruiters"
              ? text((job as { _company?: unknown })._company)
              : job.company_name
  );

  let rawLocation: unknown;
  if (source === "Remotive") rawLocation = job.candidate_required_location;
  else if (source === "Jobicy") rawLocation = job.jobGeo;
  else if (source === "Himalayas") rawLocation = job.locationRestrictions;
  else if (source === "RemoteOK") rawLocation = job.location;
  else if (source === "RemoteJobsOrg") rawLocation = job.location;
  else if (source === "RemoteFirstJobs") rawLocation = job.locations;
  else if (source === "WorkingNomads") rawLocation = job.location;
  else if (source === "ArbeitnowUK") rawLocation = job.location || "United Kingdom";
  else if (source === "Greenhouse") {
    rawLocation = isRecord(job.location) ? job.location.name : job.location;
  } else if (source === "Lever") {
    rawLocation =
      isRecord(job.categories) && typeof job.categories.location === "string"
        ? job.categories.location
        : job.location;
  } else if (source === "Ashby") {
    rawLocation =
      job.location ??
      (Array.isArray(job.secondaryLocations)
        ? job.secondaryLocations
            .map((item) => (isRecord(item) ? text(item.location) : ""))
            .filter(Boolean)
            .join(", ")
        : "");
  } else if (source === "SmartRecruiters") {
    const loc = isRecord(job.location) ? job.location : {};
    rawLocation =
      [text(loc.city), text(loc.region), text(loc.country)].filter(Boolean).join(", ") ||
      (loc.remote === true ? "Remote" : "");
  } else {
    rawLocation = job.location;
  }

  const location = Array.isArray(rawLocation)
    ? rawLocation.filter((v): v is string => typeof v === "string").join(", ") ||
      "Worldwide / Remote"
    : text(rawLocation) || "Worldwide / Remote";

  let applicationUrl = "";
  if (source === "SmartRecruiters") {
    const companyId =
      text((job as { _companySlug?: unknown })._companySlug) ||
      (isRecord(job.company) ? text(job.company.identifier) : "");
    const postingId = text(job.uuid) || text(job.id);
    if (companyId && postingId) {
      applicationUrl = `https://jobs.smartrecruiters.com/${companyId}/${postingId}`;
    }
  } else {
    applicationUrl =
      safeUrl(
        source === "Himalayas"
          ? job.applicationLink
          : source === "RemoteOK"
            ? job.apply_url
            : source === "RemoteJobsOrg"
              ? job.apply_url ?? job.url
              : source === "RemoteFirstJobs" || source === "WorkingNomads"
                ? job.url
                : source === "Greenhouse"
                  ? job.absolute_url
                  : source === "Lever"
                    ? job.hostedUrl ?? job.applyUrl
                    : source === "Ashby"
                      ? job.jobUrl ?? job.applyUrl
                      : job.url
      ) || safeUrl(job.url);
  }

  if (!id || !title || !company || !applicationUrl) return null;

  let dateValue: unknown;
  if (source === "Remotive") dateValue = job.publication_date;
  else if (source === "Jobicy" || source === "Himalayas") dateValue = job.pubDate;
  else if (source === "RemoteOK") dateValue = job.date;
  else if (source === "RemoteJobsOrg") dateValue = job.posted_at;
  else if (source === "RemoteFirstJobs") dateValue = job.published_at;
  else if (source === "WorkingNomads") dateValue = job.pub_date;
  else if (source === "Greenhouse") dateValue = job.updated_at;
  else if (source === "Lever") dateValue = job.createdAt;
  else if (source === "Ashby") dateValue = job.publishedAt ?? job.updatedAt;
  else if (source === "SmartRecruiters") dateValue = job.releasedDate;
  else dateValue = job.created_at;

  const postedAt =
    typeof dateValue === "number"
      ? source === "Arbeitnow" || source === "ArbeitnowUK" || source === "Himalayas"
        ? new Date(dateValue * 1000).toISOString()
        : new Date(dateValue).toISOString()
      : typeof dateValue === "string" && Number.isFinite(Date.parse(dateValue))
        ? new Date(dateValue).toISOString()
        : "";

  const summary = text(
    source === "Jobicy"
      ? job.jobExcerpt
      : source === "Himalayas"
        ? job.description ?? job.excerpt
        : source === "Greenhouse"
          ? job.content
          : source === "Lever"
            ? job.descriptionPlain
            : source === "Ashby"
              ? job.descriptionPlain ?? job.descriptionHtml
              : source === "SmartRecruiters"
                ? job.description
                : job.description
  );

  const workMode = detectWorkMode(title, location, summary, source, job);

  return {
    id: `${source.toLowerCase()}-${id}`,
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    workMode,
    postedAt,
    summary: summary.slice(0, 1200) || null,
    applicationUrl,
    countryCode: "WW",
    countryCodes: ["WW"],
    matchScore: 0,
    matchedSkills: [],
    source,
  };
}

function dedupeJobs(jobs: JobListing[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    let canonicalUrl = "";
    try {
      const url = new URL(job.applicationUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (
          key.toLowerCase().startsWith("utm_") ||
          ["ref", "source"].includes(key.toLowerCase())
        ) {
          url.searchParams.delete(key);
        }
      }
      canonicalUrl = url.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      canonicalUrl = job.applicationUrl.toLowerCase();
    }

    const normalizedLocation = job.countryCodes?.length
      ? [...job.countryCodes].sort().join(" ")
      : job.location;
    const normalizedText = `${job.company} ${job.title} ${normalizedLocation}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const semanticKey = `job:${normalizedText}`;
    if (seen.has(canonicalUrl) || seen.has(semanticKey)) return false;
    seen.add(canonicalUrl);
    seen.add(semanticKey);
    return true;
  });
}

async function fetchFeed(url: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "JobPilot/1.0",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchJobCount(): Promise<number> {
  try {
    const fastRequests = [
      "https://remotive.com/api/remote-jobs?limit=150",
      "https://jobicy.com/api/v2/remote-jobs?count=100",
      "https://remoteok.com/api",
      "https://himalayas.app/jobs/api?limit=25",
      "https://remotejobs.org/api/v1/jobs?limit=60",
      "https://remotefirstjobs.com/api/search-jobs",
      "https://www.workingnomads.com/api/exposed_jobs/",
      "https://www.arbeitnow.com/api/job-board-api?page=1",
      "https://www.arbeitnow.co.uk/api/job-board-api?page=1",
    ];

    const results = await Promise.all(fastRequests.map(fetchFeed));

    let count = 0;

    // Remotive
    if (isRecord(results[0])) {
      count += records(results[0].jobs).length;
    }

    // Jobicy
    if (isRecord(results[1])) {
      count += records(results[1].jobs).length;
    }

    // RemoteOK
    if (results[2]) {
      count += records(results[2]).filter((j) => j.id && j.position).length;
    }

    // Himalayas
    if (isRecord(results[3])) {
      count += records(results[3].jobs).length;
    }

    // RemoteJobsOrg
    if (isRecord(results[4])) {
      count += records(results[4].data).length;
    }

    // RemoteFirstJobs
    if (isRecord(results[5])) {
      count += records(results[5].jobs).length;
    }

    // WorkingNomads
    if (Array.isArray(results[6])) {
      count += records(results[6]).length;
    }

    // Arbeitnow
    if (isRecord(results[7])) {
      count += records(results[7].data).length;
    }

    // ArbeitnowUK
    if (isRecord(results[8])) {
      count += records(results[8].data).length;
    }

    return count;
  } catch {
    return 0;
  }
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial count
      const initialCount = await fetchJobCount();
      send({ type: "count", value: initialCount, timestamp: Date.now() });

      // Set up interval for periodic updates
      const interval = setInterval(async () => {
        try {
          const count = await fetchJobCount();
          send({ type: "count", value: count, timestamp: Date.now() });
        } catch (error) {
          send({ type: "error", message: "Failed to fetch job count", timestamp: Date.now() });
        }
      }, 30000); // Update every 30 seconds

      // Send heartbeat every 15 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: Date.now() });
      }, 15000);

      // Cleanup on connection close
      const cleanup = () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        controller.close();
      };

      // Set up a timeout to eventually close the stream (prevents hanging connections)
      setTimeout(cleanup, 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
