import { Router } from 'express';
import { getEnterpriseRegistry } from '@factum-il/enterprise-hooks';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';

export function enterpriseRouter(): Router {
  const router = Router();

  router.get('/capabilities', asyncHandler((_req, res) => {
    const reg = getEnterpriseRegistry();
    ok(res, {
      firmProfile: reg.firm,
      capabilities: {
        multiUser:          { enabled: reg.multiUser.isEnabled() },
        centralizedStorage: { enabled: reg.centralizedStorage.isEnabled() },
        adminConsole:       { enabled: reg.adminConsole.isEnabled(), url: reg.adminConsole.getConsoleUrl() },
        enterpriseBackup:   { enabled: reg.enterpriseBackup.isEnabled() },
      },
    });
  }));

  return router;
}
