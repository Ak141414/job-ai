import type { ResumeProfile } from "@/lib/jobs/types";

const skillVocabulary = [
  "JavaScript", "TypeScript", "React", "Next.js", "Vue", "Angular", "Svelte", "HTML", "CSS", "Tailwind",
  "Node.js", "Express", "Python", "Django", "Flask", "FastAPI", "Java", "Spring", "C#", ".NET", "Go", "Rust", "PHP", "Laravel", "Ruby", "Rails",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase", "Firebase", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "GraphQL", "REST APIs", "Microservices", "Linux", "Git", "GitHub", "Figma", "Jest", "Playwright", "Cypress", "Selenium",
  "Machine Learning", "Deep Learning", "Data Science", "Data Analysis", "Pandas", "NumPy", "TensorFlow", "PyTorch", "LLM", "Generative AI",
  "Project Management", "Agile", "Scrum", "Product Management", "Salesforce", "SEO", "Google Analytics", "Excel", "Power BI", "Tableau",
  "Communication", "Leadership", "Customer Support", "Recruiting", "Financial Analysis", "Accounting", "Marketing", "Content Writing",
];

const roleVocabulary = [
  "Software Engineer", "Frontend Developer", "Front End Developer", "Frontend Engineer", "Backend Developer", "Back End Developer", "Backend Engineer",
  "Full Stack Developer", "Full Stack Engineer", "Web Developer", "Mobile Developer", "iOS Developer", "Android Developer", "DevOps Engineer",
  "Data Engineer", "Data Scientist", "Data Analyst", "Machine Learning Engineer", "AI Engineer", "Product Manager", "Project Manager",
  "UI Designer", "UX Designer", "Product Designer", "Graphic Designer", "QA Engineer", "Test Engineer", "Business Analyst",
  "Accountant", "Financial Analyst", "Marketing Manager", "Digital Marketer", "Sales Representative", "Customer Success Manager", "HR Manager",
  "Recruiter", "Technical Writer", "Operations Manager", "Teacher", "Nurse", "Physician", "Civil Engineer", "Mechanical Engineer",
];

const locations = [
  "United States", "United Kingdom", "India", "Canada", "Australia", "Germany", "France", "Netherlands", "Singapore", "Japan", "Brazil", "United Arab Emirates", "South Africa", "Ireland", "New Zealand",
  "New York", "San Francisco", "Los Angeles", "Seattle", "Austin", "Boston", "Chicago", "London", "Manchester", "Bengaluru", "Bangalore", "Chennai", "Hyderabad", "Mumbai", "Pune", "Delhi", "Toronto", "Vancouver", "Montreal", "Sydney", "Melbourne", "Berlin", "Munich", "Paris", "Amsterdam", "Tokyo", "Dubai", "Cape Town", "Remote",
];

function unique(values: string[]) {
  return [...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values()];
}

export function extractResumeProfile(text: string): ResumeProfile {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const lowerText = normalizedText.toLocaleLowerCase();
  const skills = skillVocabulary.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#])${escaped.toLocaleLowerCase()}([^a-z0-9+#]|$)`, "i").test(normalizedText);
  });

  const title = roleVocabulary
    .map((role) => ({ role, index: lowerText.indexOf(role.toLocaleLowerCase()) }))
    .filter((match) => match.index >= 0)
    .sort((first, second) => first.index - second.index)[0]?.role ?? "";

  const explicitExperience = normalizedText.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience/i);
  const experienceYears = explicitExperience ? Number(explicitExperience[1]) : null;
  const matchedLocations = locations.filter((location) => lowerText.includes(location.toLocaleLowerCase()));
  const remotePreference = /\b(remote|work from home|wfh)\b/i.test(normalizedText)
    ? "Remote"
    : /\bhybrid\b/i.test(normalizedText)
      ? "Hybrid"
      : /\b(on[- ]?site|in[- ]office|office[- ]based)\b/i.test(normalizedText)
        ? "Office"
        : null;

  return {
    title,
    skills: unique(skills),
    experienceYears,
    locations: unique(matchedLocations).slice(0, 12),
    remotePreference,
  };
}
