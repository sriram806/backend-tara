import { eq, sql } from 'drizzle-orm';
import { getDb, customRoles } from '@thinkai/db';

export type CreateCustomRoleInput = {
  name: string;
  description?: string;
  permissions: string[];
  createdBy: string;
};

export type UpdateCustomRoleInput = {
  name?: string;
  description?: string;
  permissions?: string[];
};

export class CustomRolesService {
  private get db() { return getDb(); }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createRole(input: CreateCustomRoleInput) {
    const [role] = await this.db
      .insert(customRoles)
      .values({
        name: input.name,
        description: input.description ?? '',
        permissions: input.permissions,
        createdBy: input.createdBy
      })
      .returning();
    return role;
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async listRoles() {
    return this.db
      .select()
      .from(customRoles)
      .orderBy(customRoles.name);
  }

  // ─── Get one ──────────────────────────────────────────────────────────────

  async getRoleById(id: string) {
    const [role] = await this.db
      .select()
      .from(customRoles)
      .where(eq(customRoles.id, id))
      .limit(1);
    return role ?? null;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateRole(id: string, input: UpdateCustomRoleInput) {
    const [updated] = await this.db
      .update(customRoles)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.permissions ? { permissions: input.permissions } : {}),
        updatedAt: new Date()
      })
      .where(eq(customRoles.id, id))
      .returning();
    return updated ?? null;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteRole(id: string) {
    await this.db
      .delete(customRoles)
      .where(eq(customRoles.id, id));
    return { deleted: true };
  }
}
