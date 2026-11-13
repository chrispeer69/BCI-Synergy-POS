export type Role = "PLATFORM_ADMIN" | "OWNER" | "DISPATCHER" | "VIEWER";

export type Action =
  | "payments:read"
  | "paylinks:create"
  | "billing:read"
  | "users:manage"
  | "merchants:board"
  | "merchants:all"
  | "billing:close";

const GRANTS: Record<Role, Action[]> = {
  PLATFORM_ADMIN: ["payments:read", "paylinks:create", "billing:read", "users:manage", "merchants:board", "merchants:all", "billing:close"],
  OWNER: ["payments:read", "paylinks:create", "billing:read", "users:manage"],
  DISPATCHER: ["payments:read", "paylinks:create"],
  VIEWER: ["payments:read"],
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].includes(action);
}

/** Which roles a given role may assign when creating users. */
export function assignableRoles(role: Role): Role[] {
  if (role === "PLATFORM_ADMIN") return ["PLATFORM_ADMIN", "OWNER", "DISPATCHER", "VIEWER"];
  if (role === "OWNER") return ["OWNER", "DISPATCHER", "VIEWER"];
  return [];
}

/** Merchant scope: admins may view any merchant; everyone else only their own. */
export function resolveMerchantScope(user: { role: Role; merchantId: string | null }, requested?: string | null): string | null {
  if (user.role === "PLATFORM_ADMIN") return requested ?? null;
  return user.merchantId;
}
