"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Jobpiloticon from "@/app/Icon/Jobpilot.png";
import {
  Minus,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  FileText,
  Globe2,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import isoCountries from "i18n-iso-countries";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-110m.json";
import EarthGlobe from "@/app/earth-globe";
import type {
  JobListing,
  JobMarketSummary,
  ResumeProfile,
} from "@/lib/jobs/types";
import { rankJobs } from "@/lib/jobs/matching";
import {
  regions,
  regionCountryCodes,
  type RegionName,
} from "@/lib/jobs/regions";

const PAGE_SIZE = 10;
const maxResumeBytes = 10 * 1024 * 1024;
const DEFAULT_MAP_CENTER: [number, number] = [15, 12];
const DEFAULT_MAP_ZOOM = 1;

type ViewMode = "globe" | "map";
type ListingMode = "jobs" | "companies";
type WorkModeFilter = "any" | "Remote" | "Hybrid" | "Office";
type CompanyEntry = { name: string; jobs: JobListing[] };
type CountryFeature = {
  id?: string | number;
  properties?: { name?: string };
  geometry: unknown;
};

// Coordinate fallbacks for guaranteed marker placement
const KNOWN_COORDINATES: Record<string, [number, number]> = {
  US: [-95.7129, 37.0902],
  GB: [-3.436, 55.3781],
  IN: [78.9629, 20.5937],
  DE: [10.4515, 51.1657],
  FR: [2.2137, 46.2276],
  CA: [-106.3468, 56.1304],
  AU: [133.7751, -25.2744],
  SG: [103.8198, 1.3521],
  NL: [5.2913, 52.1326],
  AE: [53.8478, 23.4241],
  BR: [-51.9253, -14.235],
  JP: [138.2529, 36.2048],
};

/**
 * Animated number hook with Quintic Ease-Out:
 * Starts fast and visibly decelerates step-by-step as it reaches the target.
 */
function useAnimatedCount(target: number, duration = 1500): number {
  const [current, setCurrent] = useState(0);
  const startValRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = startValRef.current;
    const end = target;

    if (start === end) {
      setCurrent(end);
      return;
    }

    let startTime: number | null = null;

    const animate = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 5);
      const val = Math.round(start + (end - start) * ease);

      setCurrent(val);
      startValRef.current = val;

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        startValRef.current = end;
        setCurrent(end);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return current;
}

/**
 * Wrapper component to allow animations inside .map() loops.
 * Defaults to `format=true` so markers and the sidebar use identical formatting (commas).
 */
function AnimatedCountDisplay({ target, format = true }: { target: number; format?: boolean }) {
  const count = useAnimatedCount(target, 1500);
  return <>{format ? count.toLocaleString() : count}</>;
}

const countryObject = (
  worldTopology as unknown as { objects: { countries: unknown } }
).objects.countries;

const worldCountryFeatures = feature(
  worldTopology as never,
  countryObject as never,
) as unknown as { features: CountryFeature[] };

const allCountryMarkets = worldCountryFeatures.features.flatMap((country) => {
  if (country.id === undefined) return [];
  const code = isoCountries.numericToAlpha2(
    String(country.id).padStart(3, "0"),
  );
  if (!code) return [];
  let [longitude, latitude] = geoCentroid(country as never);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    const fallback = KNOWN_COORDINATES[code];
    if (fallback) {
      [longitude, latitude] = fallback;
    }
  }

  return [
    {
      code,
      name:
        isoCountries.getName(code, "en") ?? country.properties?.name ?? code,
      latitude,
      longitude,
    },
  ];
});

const topologyCountryAliases: Record<string, string> = {
  algeria: "DZ",
  angola: "AO",
  benin: "BJ",
  botswana: "BW",
  "burkina faso": "BF",
  burundi: "BI",
  "cabo verde": "CV",
  cameroon: "CM",
  "central african republic": "CF",
  chad: "TD",
  comoros: "KM",
  "republic of the congo": "CG",
  "central african rep": "CF",
  "democratic republic of the congo": "CD",
  "dem rep congo": "CD",
  "democratic republic of congo": "CD",
  congo: "CG",
  djibouti: "DJ",
  egypt: "EG",
  "equatorial guinea": "GQ",
  "eq guinea": "GQ",
  eritrea: "ER",
  eswatini: "SZ",
  ethiopia: "ET",
  gabon: "GA",
  gambia: "GM",
  "the gambia": "GM",
  ghana: "GH",
  guinea: "GN",
  "guinea-bissau": "GW",
  "cote d ivoire": "CI",
  "ivory coast": "CI",
  kenya: "KE",
  lesotho: "LS",
  liberia: "LR",
  libya: "LY",
  madagascar: "MG",
  malawi: "MW",
  mali: "ML",
  mauritania: "MR",
  mauritius: "MU",
  morocco: "MA",
  mozambique: "MZ",
  namibia: "NA",
  niger: "NE",
  nigeria: "NG",
  rwanda: "RW",
  "sao tome and principe": "ST",
  senegal: "SN",
  seychelles: "SC",
  "sierra leone": "SL",
  somalia: "SO",
  "south africa": "ZA",
  "south sudan": "SS",
  sudan: "SD",
  tanzania: "TZ",
  togo: "TG",
  tunisia: "TN",
  uganda: "UG",
  zambia: "ZM",
  zimbabwe: "ZW",
};

function countryCodeForMapName(name: string, id?: string | number) {
  if (id !== undefined) {
    const code = isoCountries.numericToAlpha2(String(id).padStart(3, "0"));
    if (code) return code;
  }
  const normalized = name
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return (
    topologyCountryAliases[normalized] ??
    isoCountries.getAlpha2Code(name, "en") ??
    null
  );
}

function formatPostedDate(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Date unavailable";
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Just posted";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function workModeLabel(mode: string) {
  return mode === "Office" ? "Work from office" : mode;
}

function countryName(code: string) {
  if (code === "WW") return "Worldwide / Remote";
  return (
    allCountryMarkets.find((market) => market.code === code)?.name ??
    isoCountries.getName(code, "en") ??
    code
  );
}

function jobCountries(job: JobListing) {
  return job.countryCodes && job.countryCodes.length > 0
    ? job.countryCodes
    : [job.countryCode];
}

function jobMatchesCountry(job: JobListing, countryCode: string) {
  return jobCountries(job).includes(countryCode);
}

function jobMatchesRegion(job: JobListing, region: RegionName) {
  const countries = jobCountries(job);
  return (
    countries.includes("WW") ||
    countries.some((code) => regionCountryCodes[region].includes(code))
  );
}

function jobIdentityKeys(job: JobListing) {
  let canonicalUrl = job.applicationUrl;
  try {
    const applicationUrl = new URL(job.applicationUrl);
    applicationUrl.hash = "";
    for (const key of [...applicationUrl.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["ref", "source"].includes(key.toLowerCase())
      ) {
        applicationUrl.searchParams.delete(key);
      }
    }
    canonicalUrl = applicationUrl.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    canonicalUrl = job.applicationUrl.toLowerCase();
  }

  const locationKey =
    jobCountries(job).slice().sort().join(" ") || job.location;
  const textKey = `${job.company} ${job.title} ${locationKey}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return [canonicalUrl, `job:${textKey}`];
}

function sortJobsNewestFirst(jobs: JobListing[]) {
  return [...jobs].sort((a, b) => {
    const aTime = Date.parse(a.postedAt);
    const bTime = Date.parse(b.postedAt);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid) return bTime - aTime;
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
}

function filterByRole(jobs: JobListing[], profile: ResumeProfile) {
  const normalizedRole = profile.title.toLowerCase().trim();
  const roleTerms = normalizedRole
    .split(/[^a-z0-9+#.]+/)
    .filter((term) => term.length > 2);
  const skillThreshold = Math.min(2, profile.skills.length);
  const ranked = rankJobs(jobs, profile);
  return ranked.filter((job) => {
    const title = job.title.toLowerCase();
    const matchingRoleTerms = roleTerms.filter((term) =>
      title.includes(term),
    ).length;
    return (
      (normalizedRole.length > 0 && title.includes(normalizedRole)) ||
      (roleTerms.length > 1 && matchingRoleTerms >= 2) ||
      (skillThreshold > 0 && job.matchedSkills.length >= skillThreshold)
    );
  });
}

export default function JobExplorer() {
  const resumeInput = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [roleJobs, setRoleJobs] = useState<JobListing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionName | "World">(
    "World",
  );
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [companyVisibleLimit, setCompanyVisibleLimit] = useState(PAGE_SIZE);
  const [view, setView] = useState<ViewMode>("globe");
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [listingMode, setListingMode] = useState<ListingMode>("jobs");
  const [query, setQuery] = useState("");
  const [workModeFilter, setWorkModeFilter] = useState<WorkModeFilter>("any");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [resumeStatus, setResumeStatus] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrapAndHydrate() {
      try {
        const response = await fetch("/api/companies", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            "The live job feeds are temporarily unavailable. Refresh once",
          );
        }

        const data = (await response.json()) as {
          jobs?: JobListing[];
          nextCursor?: string | null;
          hasMoreStages?: boolean;
        };

        const initialJobs = Array.isArray(data.jobs) ? sortJobsNewestFirst(data.jobs) : [];
        setJobs(initialJobs);
        setNextCursor(data.nextCursor ?? null);
        setLoading(false);

        let currentCursor = data.nextCursor ?? null;
        let shouldContinue = Boolean(data.hasMoreStages && currentCursor);

        if (shouldContinue) {
          setIsHydrating(true);
        }

        while (shouldContinue && !controller.signal.aborted) {
          try {
            const bgResponse = await fetch("/api/companies", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cursor: currentCursor }),
              signal: controller.signal,
            });

            if (!bgResponse.ok) break;

            const bgData = (await bgResponse.json()) as {
              jobs?: JobListing[];
              nextCursor?: string | null;
              hasMoreStages?: boolean;
            };

            const incoming = Array.isArray(bgData.jobs) ? bgData.jobs : [];
            if (incoming.length > 0) {
              setJobs((current) => {
                const known = new Set(current.flatMap(jobIdentityKeys));
                const filtered = incoming.filter((j) => {
                  const keys = jobIdentityKeys(j);
                  if (keys.some((k) => known.has(k))) return false;
                  keys.forEach((k) => known.add(k));
                  return true;
                });
                return sortJobsNewestFirst([...current, ...filtered]);
              });
            }

            currentCursor = bgData.nextCursor ?? null;
            setNextCursor(currentCursor);
            shouldContinue = Boolean(bgData.hasMoreStages && currentCursor);
          } catch {
            break;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setFeedError(
          error instanceof Error
            ? error.message
            : "The live job feeds are temporarily unavailable. Refresh once",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setIsHydrating(false);
        }
      }
    }

    void bootstrapAndHydrate();
    return () => controller.abort();
  }, []);

  const displayedJobs = roleJobs ?? jobs;

  const searchedJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return displayedJobs.filter((job) => {
      if (!normalizedQuery) return true;
      return `${job.title} ${job.company} ${job.location} ${job.summary ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [displayedJobs, query]);

  const arrangementJobs = useMemo(
    () =>
      workModeFilter === "any"
        ? searchedJobs
        : searchedJobs.filter((job) => job.workMode === workModeFilter),
    [searchedJobs, workModeFilter],
  );

  const filteredJobs = useMemo(() => {
    const base = selectedCountry
      ? arrangementJobs.filter((job) => jobMatchesCountry(job, selectedCountry))
      : selectedRegion !== "World"
        ? arrangementJobs.filter((job) => jobMatchesRegion(job, selectedRegion))
        : arrangementJobs;

    return sortJobsNewestFirst(base);
  }, [arrangementJobs, selectedCountry, selectedRegion]);

  const companies = useMemo<CompanyEntry[]>(() => {
    const companyJobs = displayedJobs.filter((job) => {
      if (selectedCountry && !jobMatchesCountry(job, selectedCountry)) {
        return false;
      }
      if (
        !selectedCountry &&
        selectedRegion !== "World" &&
        !jobMatchesRegion(job, selectedRegion)
      ) {
        return false;
      }
      if (workModeFilter !== "any" && job.workMode !== workModeFilter) {
        return false;
      }
      const normalizedQuery = query.trim().toLowerCase();
      return (
        !normalizedQuery ||
        `${job.company} ${job.title} ${job.location}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });

    const grouped = new Map<string, CompanyEntry>();
    for (const job of companyJobs) {
      const key = job.company.trim().toLocaleLowerCase();
      const company = grouped.get(key) ?? {
        name: job.company.trim(),
        jobs: [],
      };
      company.jobs.push(job);
      grouped.set(key, company);
    }

    return [...grouped.values()]
      .map((company) => ({
        ...company,
        jobs: sortJobsNewestFirst(company.jobs),
      }))
      .sort(
        (first, second) =>
          second.jobs.length - first.jobs.length ||
          first.name.localeCompare(second.name),
      );
  }, [displayedJobs, query, selectedCountry, selectedRegion, workModeFilter]);

  // Fast O(N) tally map
  const markets = useMemo<JobMarketSummary[]>(() => {
    const countMap = new Map<string, number>();
    for (const job of arrangementJobs) {
      const codes = jobCountries(job);
      for (const code of codes) {
        countMap.set(code, (countMap.get(code) ?? 0) + 1);
      }
    }

    const countryMarkets = allCountryMarkets.map((market) => ({
      ...market,
      count: countMap.get(market.code) ?? 0,
    }));

    const worldwideCount = countMap.get("WW") ?? 0;

    return [
      ...countryMarkets,
      {
        code: "WW",
        name: "Worldwide / Remote",
        latitude: 0,
        longitude: 0,
        count: worldwideCount,
      },
    ];
  }, [arrangementJobs]);

  const visibleJobs = filteredJobs.slice(0, visibleLimit);
  const visibleCompanies = companies.slice(0, companyVisibleLimit);

  // Animated tickers with decelerating countdown effect for the counts
  const animatedJobCount = useAnimatedCount(filteredJobs.length, 1500);
  const animatedCompanyCount = useAnimatedCount(companies.length, 1500);

  const highlightedCountries = useMemo<string[]>(
    () =>
      selectedCountry
        ? [selectedCountry]
        : selectedRegion === "World"
          ? []
          : [...regionCountryCodes[selectedRegion]],
    [selectedCountry, selectedRegion],
  );

  // Keep all markets in the region/world visible in the list, even when one is selected
  const visibleMarkets = useMemo(
    () =>
      markets.filter(
        (market) =>
          market.count > 0 &&
          Number.isFinite(market.latitude) &&
          Number.isFinite(market.longitude) &&
          (selectedRegion === "World" ||
            market.code === "WW" ||
            regionCountryCodes[selectedRegion].includes(market.code)),
      ),
    [markets, selectedRegion],
  );

  const selectCountry = (code: string) => {
    setVisibleLimit(PAGE_SIZE);
    setCompanyVisibleLimit(PAGE_SIZE);

    // If clicking the currently selected country, toggle it off
    if (selectedCountry === code) {
      setSelectedCountry(null);
      setMapCenter(DEFAULT_MAP_CENTER);
      setMapZoom(DEFAULT_MAP_ZOOM);
      return;
    }

    // Otherwise select the new country
    setSelectedRegion("World");
    setSelectedCountry(code);

    const target = allCountryMarkets.find((m) => m.code === code);
    if (target && target.longitude && target.latitude) {
      setMapCenter([target.longitude, target.latitude]);
      setMapZoom((prev) => Math.max(prev, 3));
    }
  };

  function selectRegion(region: RegionName | "World") {
    setSelectedRegion(region);
    setSelectedCountry(null);
    setVisibleLimit(PAGE_SIZE);
    setCompanyVisibleLimit(PAGE_SIZE);
    setMapCenter(DEFAULT_MAP_CENTER);
    setMapZoom(DEFAULT_MAP_ZOOM);
  }

  async function handleResume(file?: File) {
    if (!file) return;
    setRoleJobs(null);
    setVisibleLimit(PAGE_SIZE);
    setCompanyVisibleLimit(PAGE_SIZE);
    setResumeError("");
    setResumeStatus("");

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "pdf" && extension !== "docx") {
      setResumeError(
        "Choose a PDF or DOCX resume. Your current job list is unchanged.",
      );
      return;
    }
    if (file.size === 0 || file.size > maxResumeBytes) {
      setResumeError(
        "The resume must be larger than 0 bytes and no larger than 10 MB. Your current job list is unchanged.",
      );
      return;
    }

    setIsAnalyzing(true);
    setResumeName(file.name);
    setResumeStatus("Reading resume text locally on the app server…");
    try {
      const formData = new FormData();
      formData.set("resume", file);
      const response = await fetch("/api/resume/analyze", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        profile?: ResumeProfile;
        error?: string;
      };
      if (!response.ok || !result.profile) {
        throw new Error(result.error || "This resume could not be read.");
      }

      const profile = result.profile;
      if (!profile.title && profile.skills.length === 0) {
        setResumeError(
          "No role or recognized skills were found. Showing all available jobs.",
        );
        setRoleJobs(null);
        return;
      }

      const countryJobs = selectedCountry
        ? jobs.filter((job) => jobMatchesCountry(job, selectedCountry))
        : jobs;
      const localMatches = sortJobsNewestFirst(
        filterByRole(countryJobs, profile),
      );
      setRoleJobs(localMatches);
      setVisibleLimit(PAGE_SIZE);
      setResumeStatus(
        localMatches.length
          ? `Role filter applied${profile.title ? `: ${profile.title}` : ""}.`
          : "No role matches were found in the loaded jobs. All jobs remain available by clearing the resume filter.",
      );
    } catch (error) {
      setResumeError(
        `${error instanceof Error ? error.message : "Resume processing failed."} All available jobs remain visible.`,
      );
      setRoleJobs(null);
      setResumeName("");
      setResumeStatus("");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function clearResume() {
    setRoleJobs(null);
    setResumeName("");
    setResumeStatus("");
    setResumeError("");
    setVisibleLimit(PAGE_SIZE);
    setCompanyVisibleLimit(PAGE_SIZE);
    if (resumeInput.current) resumeInput.current.value = "";
  }

  function showAllJobs() {
    setListingMode("jobs");
    setRoleJobs(null);
    setSelectedCountry(null);
    setSelectedRegion("World");
    setQuery("");
    setWorkModeFilter("any");
    setResumeName("");
    setResumeStatus("");
    setResumeError("");
    setVisibleLimit(PAGE_SIZE);
    setCompanyVisibleLimit(PAGE_SIZE);
    setMapCenter(DEFAULT_MAP_CENTER);
    setMapZoom(DEFAULT_MAP_ZOOM);
    if (resumeInput.current) resumeInput.current.value = "";
  }

  async function loadMore() {
    if (listingMode === "jobs" && visibleLimit < filteredJobs.length) {
      setVisibleLimit((current) => current + PAGE_SIZE);
      return;
    }
    if (listingMode === "companies" && companyVisibleLimit < companies.length) {
      setCompanyVisibleLimit((current) => current + PAGE_SIZE);
      return;
    }
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor: nextCursor }),
      });
      const data = (await response.json()) as {
        jobs?: JobListing[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not load more remote jobs.");
      }
      const incomingJobs = Array.isArray(data.jobs) ? data.jobs : [];
      setJobs((current) => {
        const knownJobs = new Set(current.flatMap(jobIdentityKeys));
        const newJobs = incomingJobs.filter((job) => {
          const keys = jobIdentityKeys(job);
          if (keys.some((key) => knownJobs.has(key))) return false;
          keys.forEach((key) => knownJobs.add(key));
          return true;
        });
        return sortJobsNewestFirst([...current, ...newJobs]);
      });
      setNextCursor(data.nextCursor ?? null);
      if (listingMode === "jobs") setVisibleLimit((current) => current + PAGE_SIZE);
      else setCompanyVisibleLimit((current) => current + PAGE_SIZE);
    } catch (error) {
      setFeedError(
        error instanceof Error
          ? error.message
          : "Could not load more remote jobs.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  const isFiltering = Boolean(
    selectedCountry ||
      selectedRegion !== "World" ||
      query.trim() ||
      workModeFilter !== "any" ||
      roleJobs,
  );

  const hasMoreLocalJobs =
    listingMode === "jobs" && filteredJobs.length > visibleLimit;
  const hasMoreLocalCompanies =
    listingMode === "companies" && companies.length > companyVisibleLimit;

  const canFetchMoreFromBackend =
    !isFiltering &&
    jobs.length >= PAGE_SIZE &&
    Boolean(nextCursor) &&
    (listingMode === "jobs"
      ? visibleLimit >= jobs.length
      : companyVisibleLimit >= companies.length);

  const showLoadMore =
    !loading &&
    !feedError &&
    (listingMode === "jobs" ? filteredJobs.length > 0 : companies.length > 0) &&
    (hasMoreLocalJobs || hasMoreLocalCompanies || canFetchMoreFromBackend);

  return (
    <main className="explorer-shell">
      <header className="explorer-header">
        <Link className="explorer-brand" href="/" aria-label="JobPilot home">
          <span className="explorer-brand-mark">
            <Image
              src={Jobpiloticon}
              alt="JobPilot logo"
              width={25}
              height={25}
              priority
            />
          </span>
          <span>JobPilot</span>
          <span className="brand-world">WORLDWIDE</span>
        </Link>
        <div className="explorer-header-actions">
          {isHydrating && (
            <span className="public-access" style={{ color: "#d77946" }}>
              <span
                className="small-spinner"
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  marginRight: 6,
                }}
              />
              Streaming {animatedJobCount + Math.floor(Math.random() * 11)} openings…
            </span>
          )}
          <button
            className="coming-soon-trigger"
            type="button"
            onClick={() => setShowComingSoon(true)}
          >
            <Sparkles size={15} /> <span>AI career tools</span>{" "}
            <small>Coming soon</small>
          </button>
          <span className="public-access">
            <span /> Public access
          </span>
        </div>
      </header>

      <section className="explorer-intro">
        <div>
          <h1>
            Work, <em>without borders.</em>
          </h1>
          <p className="explorer-deck">
            Browse remote, hybrid, and office roles around the world, with
            optional resume filtering.
          </p>
        </div>
        <div className="feed-summary">
          <strong style={{ fontSize: "2.5rem", fontWeight: 900, lineHeight: 1 }}>
            {loading ? (
              "—"
            ) : listingMode === "jobs" ? (
              animatedJobCount.toLocaleString()
            ) : (
              animatedCompanyCount.toLocaleString()
            )}
          </strong>
          <span style={{ fontSize: "1 rem", fontWeight: 700, lineHeight: 1 }}>
            {listingMode === "companies"
              ? "UNIQUE EMPLOYERS LOADED"
              : selectedCountry
                ? `JOBS FOR ${countryName(selectedCountry).toUpperCase()}`
                : selectedRegion === "World"
                  ? "All Jobs"
                  : `${selectedRegion.toUpperCase()} JOBS`}
          </span>
        </div>
      </section>

      <section className="explorer-workspace" aria-label="Global job explorer">
        <div className="explorer-list-pane">
          <div className="list-toolbar">
            <div
              className="listing-mode-switch"
              role="tablist"
              aria-label="Browse jobs or companies"
            >
              <button
                type="button"
                role="tab"
                aria-selected={listingMode === "jobs"}
                className={listingMode === "jobs" ? "is-active" : ""}
                onClick={() => setListingMode("jobs")}
              >
                <BriefcaseBusiness size={14} /> Jobs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listingMode === "companies"}
                className={listingMode === "companies" ? "is-active" : ""}
                onClick={() => setListingMode("companies")}
              >
                <Building2 size={14} /> Companies
              </button>
            </div>
            <label className="explorer-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleLimit(PAGE_SIZE);
                  setCompanyVisibleLimit(PAGE_SIZE);
                }}
                placeholder="Role, company, or place"
                aria-label="Search jobs and companies by name or location"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="work-mode-control">
              <span>Work mode</span>
              <select
                aria-label="Work mode"
                value={workModeFilter}
                onChange={(event) => {
                  setWorkModeFilter(event.target.value as WorkModeFilter);
                  setVisibleLimit(PAGE_SIZE);
                  setCompanyVisibleLimit(PAGE_SIZE);
                }}
              >
                <option value="any">All work modes</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Office">Work from office</option>
              </select>
            </label>
          </div>

          <div className="resume-filter-bar">
            <div className="resume-filter-copy">
              <span className="resume-icon">
                <FileText size={16} />
              </span>
              <span>
                <strong>{resumeName || "Filter by your resume"}</strong>
                <small>
                  {resumeStatus || "PDF or DOCX · processed transiently"}
                </small>
              </span>
            </div>
            {resumeName ? (
              <button
                className="resume-clear"
                type="button"
                onClick={clearResume}
                aria-label="Clear resume filter"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                className="resume-upload-button"
                type="button"
                onClick={() => resumeInput.current?.click()}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <span className="small-spinner" />
                ) : (
                  <Upload size={15} />
                )}{" "}
                {isAnalyzing ? "Reading" : "Add resume"}
              </button>
            )}
            <input
              ref={resumeInput}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void handleResume(file);
              }}
              hidden
            />
          </div>

          {(resumeError || feedError) && (
            <div className="explorer-alert" role="status">
              {resumeError || feedError}
            </div>
          )}

          <div className="results-heading">
            <div>
              <p>
                {selectedCountry
                  ? countryName(selectedCountry).toUpperCase()
                  : selectedRegion === "World"
                    ? "WORLDWIDE"
                    : selectedRegion.toUpperCase()}
              </p>
              <h2>
                {listingMode === "jobs"
                  ? "Available jobs"
                  : "Companies hiring remotely"}
              </h2>
            </div>
            <div className="results-actions">
              {listingMode === "jobs" && (
                <button
                  className={`all-jobs-tag ${!selectedCountry && !query.trim() && !roleJobs && !resumeName ? "is-active" : ""}`}
                  type="button"
                  aria-pressed={
                    !selectedCountry &&
                    !query.trim() &&
                    !roleJobs &&
                    !resumeName
                  }
                  onClick={showAllJobs}
                >
                  All jobs <strong>{jobs.length}</strong>
                </button>
              )}
              <div className="results-count">
                <strong>
                  {listingMode === "jobs"
                    ? filteredJobs.length
                    : companies.length}
                </strong>
              </div>
            </div>
          </div>

          <div className="explorer-results" aria-live="polite">
            {loading && (
              <div className="explorer-state">
                <span className="small-spinner" /> Loading live openings
              </div>
            )}
            {!loading && feedError && jobs.length === 0 && (
              <div className="explorer-state">
                Live listings could not be loaded. Try again shortly.
              </div>
            )}
            {!loading &&
              !feedError &&
              listingMode === "jobs" &&
              filteredJobs.length === 0 && (
                <div className="explorer-state">
                  No openings match these filters.
                </div>
              )}
            {!loading &&
              !feedError &&
              listingMode === "jobs" &&
              visibleJobs.map((job) => (
                <article
                  className="opening-row"
                  key={job.id || `${job.company}-${job.title}-${job.postedAt}`}
                >
                  <span className="opening-mark">
                    {job.company.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="opening-main">
                    <div className="opening-title-line">
                      <h3>{job.title}</h3>
                    </div>
                    <p className="opening-company">{job.company}</p>
                    <div className="opening-meta">
                      <span>
                        <MapPin size={13} /> {job.location}
                      </span>
                      {job.workMode && (
                        <span className="remote-tag">
                          {workModeLabel(job.workMode)}
                        </span>
                      )}
                      <span>{formatPostedDate(job.postedAt)}</span>
                    </div>
                  </div>
                  <a
                    className="apply-button"
                    href={job.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Apply for ${job.title} at ${job.company}`}
                    title="Open application"
                  >
                    <ArrowUpRight size={17} />
                  </a>
                </article>
              ))}
            {!loading &&
              !feedError &&
              listingMode === "companies" &&
              companies.length === 0 && (
                <div className="explorer-state">
                  No companies match these filters yet.
                </div>
              )}
            {!loading &&
              !feedError &&
              listingMode === "companies" &&
              visibleCompanies.map((company) => (
                <article
                  className="company-row"
                  key={company.name.toLocaleLowerCase()}
                >
                  <span className="opening-mark">
                    {company.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="opening-main">
                    <h3>{company.name}</h3>
                    <p className="opening-company">
                      {company.jobs.length}{" "}
                      {company.jobs.length === 1 ? "opening" : "openings"}
                    </p>
                    <p className="company-roles">
                      {company.jobs
                        .slice(0, 3)
                        .map((job) => job.title)
                        .join(" · ")}
                    </p>
                  </div>
                  <a
                    className="apply-button"
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${company.name} official website`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Find the official website for ${company.name}`}
                    title="Search company website"
                  >
                    <ArrowUpRight size={17} />
                  </a>
                </article>
              ))}
            {showLoadMore && (
              <button
                className="load-more-button"
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore
                  ? "Loading more…"
                  : listingMode === "jobs"
                    ? "Load more jobs"
                    : "Load more companies"}
              </button>
            )}
          </div>

          <p className="list-footnote">
            <Check size={13} />{" "}
            {listingMode === "jobs" ? (
              <>
                Applications continue on the employer’s site. Listings include
                remote, hybrid, and office roles. Newest openings appear first.
              </>
            ) : (
              `${companies.length.toLocaleString()} unique employers in loaded job pages.`
            )}
          </p>
        </div>

        <aside className="geo-pane" aria-label="Job locations">
          <div className="geo-heading">
            <div>
              <p>EXPLORE BY COUNTRY</p>
              <h2>
                {selectedCountry
                  ? countryName(selectedCountry)
                  : selectedRegion === "World"
                    ? "The world of work"
                    : selectedRegion}
              </h2>
            </div>
            <label className="geo-region-control">
              <select
                aria-label="Map region"
                value={selectedRegion}
                onChange={(event) =>
                  selectRegion(event.target.value as RegionName | "World")
                }
              >
                <option value="World">World</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            {selectedCountry && (
              <button
                className="clear-country"
                type="button"
                onClick={() => {
                  setSelectedCountry(null);
                  setMapCenter(DEFAULT_MAP_CENTER);
                  setMapZoom(DEFAULT_MAP_ZOOM);
                }}
              >
                All countries
              </button>
            )}
          </div>

          <div className="geo-view-switch" role="tablist" aria-label="Map view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "globe"}
              className={view === "globe" ? "is-active" : ""}
              onClick={() => setView("globe")}
            >
              <Globe2 size={15} /> Globe
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "map"}
              className={view === "map" ? "is-active" : ""}
              onClick={() => setView("map")}
            >
              <MapIcon size={15} /> Map
            </button>
          </div>

          <div className="geo-canvas">
            {view === "globe" ? (
              <EarthGlobe
                key={`earth-globe-${selectedRegion}-${selectedCountry ?? ""}-${jobs.length > 0 ? "active" : "empty"}`}
                markets={visibleMarkets.filter((market) => market.code !== "WW")}
                selectedCountry={selectedCountry}
                highlightedCountries={highlightedCountries}
                onSelectCountry={selectCountry}
              />
            ) : (
              <ComposableMap
                projection="geoEqualEarth"
                projectionConfig={{ scale: 155 }}
                style={{ width: "100%", height: "100%" }}
              >
                <ZoomableGroup
                  center={mapCenter}
                  zoom={mapZoom}
                  minZoom={1}
                  maxZoom={8}
                  onMoveEnd={({ coordinates, zoom }) => {
                    if (coordinates && coordinates.length === 2) {
                      setMapCenter(coordinates as [number, number]);
                    }
                    if (zoom) {
                      setMapZoom(zoom);
                    }
                  }}
                >
                  <Geographies geography={worldTopology as never}>
                    {({ geographies }) =>
                      geographies.map((geography) => {
                        const properties = geography.properties as {
                          name?: string;
                        };
                        const countryCode = countryCodeForMapName(
                          properties.name ?? "",
                          geography.id,
                        );
                        const isSelected = Boolean(
                          countryCode &&
                          highlightedCountries.includes(countryCode),
                        );
                        return (
                          <Geography
                            key={geography.rsmKey}
                            geography={geography}
                            fill={isSelected ? "#d4e65c" : "#e2e4dc"}
                            stroke="#fffefa"
                            strokeWidth={0.55}
                            style={{
                              default: {
                                fill: isSelected ? "#d4e65c" : "#e2e4dc",
                                outline: "none",
                                cursor: "pointer",
                              },
                              hover: {
                                fill: isSelected ? "#c5d947" : "#cfd3c7",
                                outline: "none",
                                cursor: "pointer",
                              },
                              pressed: {
                                fill: "#b7cb3b",
                                outline: "none",
                              },
                            }}
                            onClick={() => {
                              if (countryCode) selectCountry(countryCode);
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                  {visibleMarkets
                    .filter((market) => {
                      if (market.code === "WW") return false;
                      if (market.latitude === 0 && market.longitude === 0) {
                        return false;
                      }
                      return true;
                    })
                    .map((market) => (
                      <Marker
                        key={`map-pin-${market.code}`}
                        coordinates={[market.longitude, market.latitude]}
                        onClick={() => selectCountry(market.code)}
                      >
                        <circle
                          r={6}
                          fill="#d77946"
                          stroke="#fffefa"
                          strokeWidth={1.4}
                          style={{ cursor: "pointer" }}
                        />
                        <text
                          textAnchor="middle"
                          y={-10}
                          style={{
                            fontFamily: "sans-serif",
                            fontSize: 10,
                            fontWeight: 800,
                            fill: "#203c35",
                            pointerEvents: "none",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <AnimatedCountDisplay target={market?.count} />
                        </text>
                      </Marker>
                    ))}
                </ZoomableGroup>
              </ComposableMap>
            )}
            {view === "map" && (
              <div className="geo-zoom-controls" aria-label="Map zoom controls">
                <button
                  type="button"
                  onClick={() => setMapZoom((zoom) => Math.min(8, zoom + 0.5))}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setMapZoom((zoom) => Math.max(1, zoom - 0.5))}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <Minus size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="country-counts" aria-label="Country job counts">
            {visibleMarkets
              .sort((first, second) => {
                if (first.code === "WW") return -1;
                if (second.code === "WW") return 1;
                return second.count - first.count;
              })
              .map((market) => (
                <button
                  type="button"
                  key={`drawer-btn-${market.code}`}
                  className={
                    selectedCountry === market.code ? "is-selected" : ""
                  }
                  onClick={() => selectCountry(market.code)}
                >
                  <span>{market.name}</span>
                  <strong>
                    <AnimatedCountDisplay target={market?.count} />
                  </strong>
                </button>
              ))}
            {!visibleMarkets.length && (
              <span className="country-count-empty"></span>
            )}
          </div>
        </aside>
      </section>

      {showComingSoon && (
        <div
          className="coming-soon-backdrop"
          role="presentation"
          onClick={() => setShowComingSoon(false)}
        >
          <section
            className="coming-soon-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coming-soon-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              type="button"
              onClick={() => setShowComingSoon(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <span className="dialog-icon">
              <Sparkles size={19} />
            </span>
            <p>JOBPILOT TOOLS</p>
            <h2 id="coming-soon-title">Coming soon</h2>
            <span>
              AI-powered career tools are not available yet. Job search and
              deterministic resume filters are ready to use.
            </span>
          </section>
        </div>
      )}
    </main>
  );
}