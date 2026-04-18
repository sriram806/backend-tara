import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import {
  organizationIdFromBody,
  organizationIdFromParams,
  organizationIdFromQuery,
  requireOrganizationMembership,
  requireOrganizationRole
} from '../middleware/organization.middleware';
import { OrganizationController } from '../controllers/organization.controller';

export const orgRoutes: FastifyPluginAsync = async (app) => {
  const controller = new OrganizationController();

  app.post('/create', { preHandler: userAuthMiddleware }, (request, reply) => controller.create(request, reply));
  app.post('/invite', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationRole(organizationIdFromBody('organizationId'), ['admin'])
    ]
  }, (request, reply) => controller.invite(request, reply));
  app.post('/join', { preHandler: userAuthMiddleware }, (request, reply) => controller.join(request, reply));
  app.get('/dashboard', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationMembership(organizationIdFromQuery('organizationId'))
    ]
  }, (request, reply) => controller.dashboard(request, reply));
  app.get('/members', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationMembership(organizationIdFromQuery('organizationId'), ['admin', 'mentor'])
    ]
  }, (request, reply) => controller.members(request, reply));
  app.get('/member/:memberId', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationMembership(organizationIdFromQuery('organizationId'), ['admin', 'mentor'])
    ]
  }, (request, reply) => controller.member(request, reply));
  app.post('/assignments', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationRole(organizationIdFromBody('organizationId'), ['admin', 'mentor'])
    ]
  }, (request, reply) => controller.createAssignment(request, reply));
  app.get('/assignments', {
    preHandler: [
      userAuthMiddleware,
      requireOrganizationMembership(organizationIdFromQuery('organizationId'))
    ]
  }, (request, reply) => controller.assignments(request, reply));
};