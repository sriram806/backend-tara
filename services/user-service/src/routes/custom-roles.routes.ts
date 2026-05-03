import { FastifyInstance } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { fullAdminMiddleware, requirePermission } from '../middleware/admin.middleware';
import { CustomRolesController } from '../controllers/custom-roles.controller';

const ctrl = new CustomRolesController();

/**
 * Custom roles routes — full admin only.
 * Registered under /admin/roles.
 */
export async function customRolesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', fullAdminMiddleware);

  app.post('/', { preHandler: requirePermission('feature-flag:manage') },
    (req, reply) => ctrl.createRole(req, reply));

  app.get('/', (req, reply) => ctrl.listRoles(req, reply));

  app.get('/:id', (req, reply) => ctrl.getRole(req, reply));

  app.patch('/:id', { preHandler: requirePermission('feature-flag:manage') },
    (req, reply) => ctrl.updateRole(req, reply));

  app.delete('/:id', { preHandler: requirePermission('feature-flag:manage') },
    (req, reply) => ctrl.deleteRole(req, reply));
}
