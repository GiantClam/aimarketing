export type SkillDescriptor = {
  readonly id: string;
  readonly digest: string;
  readonly relativePath: string;
};

export type SkillCatalog = {
  readonly schemaVersion: 1;
  readonly sourceRoot: string;
  readonly sourceDigest: string;
  readonly generatedAt: string;
  readonly skills: readonly SkillDescriptor[];
};

export function normalizeSkillId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function sortSkillDescriptors(skills: readonly SkillDescriptor[]) {
  return [...skills].sort((left, right) => left.id.localeCompare(right.id) || left.relativePath.localeCompare(right.relativePath));
}

export function validateSkillCatalog(catalog: SkillCatalog) {
  const ids = new Set<string>();
  for (const skill of catalog.skills) {
    if (!skill.id || ids.has(skill.id) || !/^[a-f0-9]{64}$/u.test(skill.digest) || !skill.relativePath.endsWith("SKILL.md")) return false;
    ids.add(skill.id);
  }
  return catalog.schemaVersion === 1 && /^[a-f0-9]{64}$/u.test(catalog.sourceDigest) && catalog.skills.length === ids.size;
}
