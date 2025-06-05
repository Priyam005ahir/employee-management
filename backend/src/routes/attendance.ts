import express from 'express';
import { 
  getAllAttendanceLogs,
  getAttendanceLog,
  createAttendanceLog,
  deleteAttendanceLog,
  getAttendanceSummary,
  getTodayAttendance,
  recordAttendance
} from '../controllers/attendanceController';

const router = express.Router();

router.get('/', getAllAttendanceLogs);


// Put specific routes FIRST
router.get('/summary/date-range', getAttendanceSummary);
router.get('/summary/today', getTodayAttendance);

// Then list all logs
//router.get('/', getAllAttendanceLogs);

// Then param route LAST
router.get('/:id', getAttendanceLog);

// Then create, delete, record routes
router.post('/', createAttendanceLog);
router.delete('/:id', deleteAttendanceLog);
router.post('/record', recordAttendance);

export default router;
