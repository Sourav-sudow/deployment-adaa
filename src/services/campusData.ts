import campusRegistryData from "../../data/campusRegistry.json";
import campusContentPacksData from "../../data/campusContentPacks.json";

export type CampusTerm = {
  id: string;
  name: string;
};

export type CampusProgram = {
  id: string;
  name: string;
  terms: CampusTerm[];
};

export type CampusDepartment = {
  id: string;
  name: string;
  programs: CampusProgram[];
};

export type UniversityRegistryEntry = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  emailDomains: string[];
  verificationRules?: {
    otpEnabled?: boolean;
    trustedDomains?: string[];
  };
  departments: CampusDepartment[];
};

export type CampusTopic = {
  title: string;
  narration?: string;
  videoUrl?: string;
};

export type CampusUnit = {
  id: string;
  title: string;
  topics: string[];
};

export type CampusSubject = {
  id: string;
  title: string;
  units: CampusUnit[];
  topics: CampusTopic[];
};

export type CampusContentPack = {
  id: string;
  name: string;
  universityId?: string;
  universitySlug?: string;
  universityName?: string;
  departmentId: string;
  departmentName: string;
  programId: string;
  programName: string;
  termId: string;
  termName: string;
  reviewStatus: "draft" | "review" | "approved";
  reviewNotes?: string;
  generatedByAI?: boolean;
  reviewedBy?: string;
  reviewedAt?: number;
  subjects: CampusSubject[];
  source?: string;
  updatedAt?: number;
  ingestedBy?: string;
};

export type CampusSelection = {
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  referralCode?: string;
};

export type LegacyCoursesDataShape = Record<
  string,
  {
    name: string;
    years: Record<
      string,
      {
        subjects: Record<
          string,
          {
            name: string;
            units: CampusUnit[];
            topics: CampusTopic[];
          }
        >;
      }
    >;
  }
>;

const universityRegistry = campusRegistryData as UniversityRegistryEntry[];
const starterContentPacks = campusContentPacksData as CampusContentPack[];

export function getUniversityRegistry() {
  return universityRegistry;
}

export function getDefaultUniversity() {
  return universityRegistry[0] || null;
}

export function findUniversity(
  universityIdOrSlug?: string | null
): UniversityRegistryEntry | null {
  if (!universityIdOrSlug) return getDefaultUniversity();
  const normalized = universityIdOrSlug.trim().toLowerCase();
  return (
    universityRegistry.find(
      (item) =>
        item.id.toLowerCase() === normalized || item.slug.toLowerCase() === normalized
    ) || null
  );
}

export function findUniversityByEmailDomain(email?: string | null) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail.includes("@")) return null;

  const domain = normalizedEmail.split("@", 2)[1] || "";
  if (!domain) return null;

  return (
    universityRegistry.find((item) =>
      (item.emailDomains || []).some((candidate) => candidate.trim().toLowerCase() === domain)
    ) || null
  );
}

export function findDepartment(
  universityIdOrSlug?: string | null,
  departmentId?: string | null
) {
  const university = findUniversity(universityIdOrSlug);
  if (!university || !departmentId) return null;
  const normalized = departmentId.trim().toLowerCase();
  return (
    university.departments.find((item) => item.id.toLowerCase() === normalized) || null
  );
}

export function findProgram(
  universityIdOrSlug?: string | null,
  departmentId?: string | null,
  programId?: string | null
) {
  const department = findDepartment(universityIdOrSlug, departmentId);
  if (!department || !programId) return null;
  const normalized = programId.trim().toLowerCase();
  return department.programs.find((item) => item.id.toLowerCase() === normalized) || null;
}

export function findTerm(
  universityIdOrSlug?: string | null,
  departmentId?: string | null,
  programId?: string | null,
  termId?: string | null
) {
  const program = findProgram(universityIdOrSlug, departmentId, programId);
  if (!program || !termId) return null;
  const normalized = termId.trim().toLowerCase();
  return program.terms.find((item) => item.id.toLowerCase() === normalized) || null;
}

export function getDepartmentsForUniversity(universityIdOrSlug?: string | null) {
  return findUniversity(universityIdOrSlug)?.departments || [];
}

export function getProgramsForDepartment(
  universityIdOrSlug?: string | null,
  departmentId?: string | null
) {
  return findDepartment(universityIdOrSlug, departmentId)?.programs || [];
}

export function getTermsForProgram(
  universityIdOrSlug?: string | null,
  departmentId?: string | null,
  programId?: string | null
) {
  return findProgram(universityIdOrSlug, departmentId, programId)?.terms || [];
}

export function resolveCampusMetadata(selection: CampusSelection) {
  const university = findUniversity(selection.universityId || selection.universitySlug);
  const department = findDepartment(
    university?.id || selection.universityId || selection.universitySlug,
    selection.departmentId
  );
  const program = findProgram(
    university?.id || selection.universityId || selection.universitySlug,
    selection.departmentId,
    selection.programId
  );
  const term = findTerm(
    university?.id || selection.universityId || selection.universitySlug,
    selection.departmentId,
    selection.programId,
    selection.termId
  );

  return {
    university,
    department,
    program,
    term,
  };
}

export function getStarterContentPack(selection: CampusSelection): CampusContentPack | null {
  const { university, department, program, term } = resolveCampusMetadata(selection);
  const basePack =
    starterContentPacks.find(
      (pack) =>
        pack.departmentId === department?.id &&
        pack.programId === program?.id &&
        pack.termId === term?.id
    ) || starterContentPacks[0] || null;

  if (!basePack) return null;

  return {
    ...basePack,
    universityId: university?.id || selection.universityId || "",
    universitySlug: university?.slug || selection.universitySlug || "",
    universityName: university?.name || "",
    departmentId: department?.id || basePack.departmentId,
    departmentName: department?.name || basePack.departmentName,
    programId: program?.id || basePack.programId,
    programName: program?.name || basePack.programName,
    termId: term?.id || basePack.termId,
    termName: term?.name || basePack.termName,
  };
}

export function buildCoursesDataFromContentPack(
  pack: CampusContentPack | null
): LegacyCoursesDataShape {
  if (!pack) return {};

  return {
    [pack.programName]: {
      name: pack.programName,
      years: {
        [pack.termName]: {
          subjects: Object.fromEntries(
            pack.subjects.map((subject) => [
              subject.id,
              {
                name: subject.title,
                units: subject.units || [],
                topics: subject.topics || [],
              },
            ])
          ),
        },
      },
    },
  };
}

export function getUniversityDomainMatch(
  email: string,
  universityIdOrSlug?: string | null
) {
  const university = findUniversity(universityIdOrSlug);
  if (!university) return false;
  const domain = email.trim().toLowerCase().split("@")[1] || "";
  return university.emailDomains.some((item) => item.toLowerCase() === domain);
}

export function getCampusSelectionSummary(selection: CampusSelection) {
  const { university, department, program, term } = resolveCampusMetadata(selection);

  return {
    universityName: university?.name || "",
    universitySlug: university?.slug || "",
    departmentName: department?.name || "",
    programName: program?.name || "",
    termName: term?.name || "",
  };
}

export function getStarterPackOptions() {
  return starterContentPacks;
}
