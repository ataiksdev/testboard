export const ROLES = ["Admin", "PM", "BA", "Dev", "QA", "Guest"];

export const ROLE_COLOR_VAR = {
  Admin: '--primary-neon',
  PM: '--accent-mustard',
  BA: '--accent-blue',
  Dev: '--primary-accent',
  QA: '--status-reviewing',
  Guest: '--text-subtle',
};

export const canManageProjects = (role) => ['Admin', 'PM', 'QA', 'BA'].includes(role);
export const canManageBugs = (role) => ['Admin', 'Dev', 'QA'].includes(role);
export const canManageMembers = (role) => ['Admin', 'PM'].includes(role);
export const canViewReports = (role) => role !== 'Dev';
export const canViewDocuments = (role) => !['Dev', 'Guest'].includes(role);
export const canEditBugFields = (role) => ['Admin', 'QA'].includes(role);
