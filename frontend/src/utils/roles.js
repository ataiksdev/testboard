export const ROLES = ["Admin", "PM", "Dev", "QA", "Guest"];

export const ROLE_COLOR_VAR = {
  Admin: '--primary-neon',
  PM: '--accent-mustard',
  Dev: '--primary-accent',
  QA: '--status-reviewing',
  Guest: '--text-subtle',
};

export const canManageProjects = (role) => ['Admin', 'PM', 'QA'].includes(role);
export const canManageBugs = (role) => ['Admin', 'Dev', 'QA'].includes(role);
export const canManageMembers = (role) => ['Admin', 'PM'].includes(role);
