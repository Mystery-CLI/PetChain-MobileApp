import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { errBody } from './response';
import { applySecurityHeaders } from '../middleware/securityHeaders';
import { sanitizeInputs } from '../middleware/sanitize';
import { createRedisSessionMiddleware } from '../middleware/redisSession';
import analyticsRouter from './routes/analytics';
import appointmentsRouter from './routes/appointments';
import auditLogsRouter from './routes/auditLogs';
import backupsRouter from './routes/backups';
import communityRouter from './routes/community';
import docsRouter from './routes/docs';
import emergencyRouter from './routes/emergency';
import importRouter from './routes/import';
import insuranceRouter from './routes/insurance';
import medicalRecordsRouter from './routes/medicalRecords';
import medicationsRouter from './routes/medications';
import paymentsRouter from './routes/payments';
import petsRouter from './routes/pets';
import privacyRouter from './routes/privacy';
import searchRouter from './routes/search';
import syncRouter from './routes/sync';
import usersRouter from './routes/users';
import vetsRouter from './routes/vets';
import photosRouter from './routes/photos';
import { attachAudit } from '../middleware/auditLog';
import { authRateLimiter, dataRateLimiter } from '../middleware/rateLimiter';

// Readiness probe state — set to false while the process is draining
let isReady = true;
export function setReadiness(ready: boolean): void {
  isReady = ready;
}

export function createApp(): Express {
  const app = express();

  // Security headers (Helmet + CSP + HSTS) — applied before any routes
  applySecurityHeaders(app);

  app.use(cors());
  app.use(express.json());
  app.use(sanitizeInputs);
  app.use(createRedisSessionMiddleware());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(attachAudit as any);

  const api = express.Router();

  // --- Health & readiness probes (unauthenticated) -----------------------
  api.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'petchain-api', timestamp: new Date().toISOString() });
  });

  api.get('/ready', (_req, res) => {
    if (!isReady) {
      res.status(503).json({
        ok: false,
        service: 'petchain-api',
        reason: 'Shutting down — draining connections',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.json({ ok: true, service: 'petchain-api', timestamp: new Date().toISOString() });
  });

  // --- Application routes ------------------------------------------------
  api.use('/analytics', dataRateLimiter, analyticsRouter);
  api.use('/backups', dataRateLimiter, backupsRouter);
  api.use('/users', authRateLimiter, usersRouter);
  api.use('/pets', dataRateLimiter, petsRouter);
  api.use('/medical-records', dataRateLimiter, medicalRecordsRouter);
  api.use('/appointments', dataRateLimiter, appointmentsRouter);
  api.use('/medications', dataRateLimiter, medicationsRouter);
  api.use('/import', dataRateLimiter, importRouter);
  api.use('/payments', dataRateLimiter, paymentsRouter);
  api.use('/audit-logs', dataRateLimiter, auditLogsRouter);
  api.use('/docs', docsRouter);
  api.use('/emergency', dataRateLimiter, emergencyRouter);
  api.use('/community', dataRateLimiter, communityRouter);
  api.use('/photos', dataRateLimiter, photosRouter);
  api.use('/sync', dataRateLimiter, syncRouter);
  api.use('/vets', dataRateLimiter, vetsRouter);
  api.use('/privacy', dataRateLimiter, privacyRouter);
  api.use('/insurance', dataRateLimiter, insuranceRouter);
  api.use('/search', dataRateLimiter, searchRouter);

  app.use('/api', api);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled Error:', err);
    res.status(500).json(errBody('INTERNAL_ERROR', err.message || 'An unexpected error occurred'));
  });

  app.use((_req, res) => {
    res.status(404).json(errBody('NOT_FOUND', 'Route not found'));
  });

  return app;
}
