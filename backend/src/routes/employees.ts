import express from 'express';
import { 
  getAllEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeAttendance,
  generateFaceEncoding,
  upload
} from '../controllers/employeeController';

const router = express.Router();

/**
 * @route   GET /api/employees
 * @desc    Get all employees
 */
router.get('/', getAllEmployees);

/**
 * @route   GET /api/employees/:id
 * @desc    Get a single employee by ID
 */
router.get('/:id', getEmployee);

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 */
router.post('/', upload.single('image'), createEmployee);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update an employee
 */
router.put('/:id', upload.single('image'), updateEmployee);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete an employee
 */
router.delete('/:id', deleteEmployee);

/**
 * @route   GET /api/employees/:id/attendance
 * @desc    Get attendance logs for an employee
 */
router.get('/:id/attendance', getEmployeeAttendance);

/**
 * @route   POST /api/employees/face-encoding
 * @desc    Generate face encoding from image
 */
router.post('/face-encoding', upload.single('image'), generateFaceEncoding);

export default router;
