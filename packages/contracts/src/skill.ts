export const SKILL_PERMISSIONS = [
  "read",
  "propose-edit",
  "write-copy",
  "export"
] as const;

export type SkillPermission = (typeof SKILL_PERMISSIONS)[number];
