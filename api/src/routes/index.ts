import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';
import { daily, hourly, monthly, questionsBySub, subs, weekly } from '../controllers/rollupController.js';
import * as sessions from '../controllers/sessionController.js';

const router = Router();

router.get('/health', getHealth);
router.get('/subs', subs);
router.get('/questions/by-sub', questionsBySub);
router.get('/sessions/active', sessions.getActive);
router.get('/sessions', sessions.list);
router.post('/sessions', sessions.create);
router.get('/sessions/:id', sessions.getOne);
router.patch('/sessions/:id/stop', sessions.stop);
router.patch('/sessions/:id/revision', sessions.patchRevision);
router.patch('/sessions/:id/lecture', sessions.patchLecture);
router.patch('/sessions/:id/qsolve', sessions.patchQsolve);
router.patch('/sessions/:id/test', sessions.patchTest);
router.patch('/sessions/:id/analysis', sessions.patchAnalysis);
router.patch('/sessions/:id', sessions.edit);
router.delete('/sessions/:id', sessions.remove);
router.get('/daily', daily);
router.get('/daily/:date/hourly', hourly);
router.get('/weekly', weekly);
router.get('/monthly', monthly);

export default router;
