import { ALL_ROLES, UserRole } from "../auth/AuthContext";

// ---------------------------------------------------------------------------
// Role permission configuration (จัดการสิทธิ์การเข้าถึงตาม Role)
//
// The matrix is persisted as ONE Firestore document:
//   CMG-HR-Database / root / settings / role_permissions
// shaped as { [roleKey: string]: { [moduleKey: string]: boolean } }.
//
// The config acts as an OVERRIDE LAYER on top of the existing hard-coded
// visibility gating. If there is no explicit entry for a given role+module,
// the caller must fall back to the existing default gating so nothing breaks.
// ---------------------------------------------------------------------------

export type RolePermissionConfig = Record<string, Record<string, boolean>>;

// Firestore location for the single config document.
// (Follows the existing convention: CMG-HR-Database/root/<subcollection>/<doc>,
//  e.g. appMeta/config, day_offs/*, users/*.)
export const ROLE_PERMISSIONS_COLLECTION = "settings";
export const ROLE_PERMISSIONS_DOC_ID = "role_permissions";

// Roles allowed to OPEN and EDIT this settings page. Per product decision:
// ONLY MasterAdmin. This is intentionally NOT MD/GM/etc.
export const SUPER_ADMIN_ROLES: UserRole[] = ["MasterAdmin"];

// The permission key for the Role-permission settings page itself.
export const ROLE_PERMISSIONS_MODULE_KEY = "role_permissions";

// Modules that a super-admin must ALWAYS retain access to, regardless of the
// saved config. Guards against self-lockout.
export const ALWAYS_ALLOWED_FOR_SUPER_ADMIN: string[] = [
  ROLE_PERMISSIONS_MODULE_KEY,
  "users_data",
];

export interface RolePermissionModule {
  key: string;
  label: string;
}

// The full list of sidebar modules/menu items that can be toggled per role.
// Keys MUST match the `activeModule` ids used in App.tsx.
export const ROLE_PERMISSION_MODULES: RolePermissionModule[] = [
  { key: "manpower_dashboard", label: "Dashboard" },
  { key: "projects", label: "โครงการ" },
  { key: "emp_indirect", label: "พนักงาน: Staff Monthly" },
  { key: "emp_direct_leader", label: "พนักงาน: DC Daily" },
  { key: "emp_direct_supply", label: "พนักงาน: Supply manpower" },
  { key: "emp_direct_sub", label: "พนักงาน: Sub contractor" },
  { key: "position_labor", label: "พนักงาน: Position Labor" },
  { key: "users_data", label: "จัดการผู้ใช้ (Admin)" },
  { key: "attendance", label: "ลงเวลาการมาทำงาน" },
  { key: "overtime", label: "ลง Overtime" },
  { key: "day_off", label: "วันหยุด (Day Off)" },
  { key: "evaluation", label: "ประเมินผลพนักงาน" },
  { key: "risk_monitoring", label: "Risk Monitoring" },
  { key: "activity_logs", label: "Activity Logs" },
  { key: ROLE_PERMISSIONS_MODULE_KEY, label: "จัดการสิทธิ์การเข้าถึงตาม Role" },
];

// Roles shown on the axis of the matrix (same order as ALL_ROLES).
export const ROLE_PERMISSION_ROLES: UserRole[] = [...ALL_ROLES];

export const isSuperAdminRoles = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => (SUPER_ADMIN_ROLES as string[]).includes(r));

// ---------------------------------------------------------------------------
// Default (hard-coded) visibility mapping.
//
// This MIRRORS the `dfXxx = hasRole([...])` defaults used in App.tsx so the
// matrix can display the computed default value per single role. `"*"` means
// "visible to everyone by default".
//
// NOTE: `hasRole` treats MasterAdmin as an override that returns true for
// everything, so MasterAdmin is effectively allowed for every module (see
// `defaultVisibleForRole`). MasterAdmin is also listed explicitly below for
// clarity.
//
// CAVEAT: `evaluation` also has a runtime rule (a user assigned as a Tier 1/2
// evaluator can see it regardless of role). That is per-user, not per-role, so
// it cannot be encoded here; the mapping reflects only the role-based default.
// ---------------------------------------------------------------------------
export const MODULE_DEFAULT_ROLES: Record<string, UserRole[] | "*"> = {
  manpower_dashboard: "*",
  projects: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  emp_indirect: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  emp_direct_leader: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  emp_direct_supply: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  emp_direct_sub: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  position_labor: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  users_data: ["MasterAdmin"],
  attendance: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR", "Admin Site"],
  overtime: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR", "Admin Site"],
  day_off: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  evaluation: ["MasterAdmin", "MD", "GM", "PD", "PM", "CM", "HRM", "HR"],
  risk_monitoring: ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"],
  activity_logs: ["MasterAdmin", "MD", "GM", "HRM"],
  [ROLE_PERMISSIONS_MODULE_KEY]: ["MasterAdmin"],
};

/**
 * Whether a user whose ONLY role is `roleKey` would see `moduleKey` under the
 * CURRENT hard-coded default gating (ignoring any saved override config).
 * Pure function — safe to call during render.
 */
export function defaultVisibleForRole(moduleKey: string, roleKey: string): boolean {
  // MasterAdmin override: hasRole() returns true for everything.
  if (roleKey === "MasterAdmin") return true;
  const def = MODULE_DEFAULT_ROLES[moduleKey];
  if (def === undefined) return false;
  if (def === "*") return true;
  return def.includes(roleKey as UserRole);
}

/**
 * Decide whether a menu item / module should be visible to the current user.
 *
 * Rules (in priority order):
 *  1. The Role-permission page itself is MasterAdmin-only and can never be
 *     granted to another role via config.
 *  2. Super-admin (MasterAdmin) bypasses the override entirely and keeps the
 *     default visibility (which already grants everything) — this guarantees
 *     no self-lockout.
 *  3. Otherwise, if ANY of the user's roles has an explicit config entry for
 *     this module, the module is visible when ANY of those explicit entries is
 *     `true` (OR across the user's roles).
 *  4. If NO role has an explicit entry, fall back to the existing default
 *     gating (`defaultVisible`).
 */
export function isModuleVisible(
  moduleKey: string,
  userRoles: string[] | undefined | null,
  config: RolePermissionConfig | null,
  defaultVisible: boolean
): boolean {
  const roles = userRoles || [];

  // (1) The settings page itself is strictly MasterAdmin-only.
  if (moduleKey === ROLE_PERMISSIONS_MODULE_KEY) {
    return roles.includes("MasterAdmin");
  }

  // (2) Super-admin bypass + self-lockout guard.
  if (isSuperAdminRoles(roles)) {
    if (ALWAYS_ALLOWED_FOR_SUPER_ADMIN.includes(moduleKey)) return true;
    return defaultVisible;
  }

  // (3) Explicit config override (OR across the user's roles).
  if (config) {
    const explicit: boolean[] = [];
    for (const role of roles) {
      const value = config[role]?.[moduleKey];
      if (typeof value === "boolean") explicit.push(value);
    }
    if (explicit.length > 0) {
      return explicit.some(Boolean);
    }
  }

  // (4) No config entry -> keep existing default behavior.
  return defaultVisible;
}
