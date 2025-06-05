import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';

// Get all attendance logs


export const getAllAttendanceLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    // Parse and validate employeeId
    const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string, 10) : undefined;
    if (req.query.employeeId && (isNaN(employeeId!) || employeeId! < 0)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }

    // Parse and validate cameraId
    const cameraId = req.query.cameraId ? parseInt(req.query.cameraId as string, 10) : undefined;
    if (req.query.cameraId && (isNaN(cameraId!) || cameraId! < 0)) {
      res.status(400).json({ error: 'Invalid camera ID' });
      return;
    }

    let query = `
      SELECT al.log_id, al.timestamp, al.gesture_detected,
             e.employee_id, e.name,
             c.camera_id, c.camera_name
      FROM attendance_logs al
      LEFT JOIN employee e ON al.employee_id = e.employee_id
      LEFT JOIN cctv_cameras c ON al.camera_id = c.camera_id
    `;

    const queryParams: any[] = [];
    const conditions: string[] = [];

    if (startDate) {
      queryParams.push(startDate);
      conditions.push(`al.timestamp >= $${queryParams.length}`);
    }

    if (endDate) {
      queryParams.push(endDate);
      conditions.push(`al.timestamp <= $${queryParams.length}`);
    }

    if (employeeId !== undefined) {
      queryParams.push(employeeId);
      conditions.push(`al.employee_id = $${queryParams.length}`);
    }

    if (cameraId !== undefined) {
      queryParams.push(cameraId);
      conditions.push(`al.camera_id = $${queryParams.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY al.timestamp DESC`;

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    queryParams.push(limit, offset);
    query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const result = await pool.query(query, queryParams);

    // Count query
    let countQuery = `
      SELECT COUNT(*) as total
      FROM attendance_logs al
    `;
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    const countQueryParams = queryParams.slice(0, queryParams.length - 2); // Exclude LIMIT and OFFSET
    const countResult = await pool.query(countQuery, countQueryParams);
    const total = parseInt(countResult.rows[0].total);

    res.status(200).json({
      status: 'success',
      results: result.rows.length,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: {
        logs: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};


// Get attendance log by ID
export const getAttendanceLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid attendance log ID' });
      return;
    }

    const result = await pool.query(
      `SELECT al.log_id, al.timestamp, al.gesture_detected, 
              e.employee_id, e.name, 
              c.camera_id, c.camera_name as camera_name
       FROM attendance_logs al
       JOIN employee e ON al.employee_id = e.employee_id
       JOIN cctv_cameras c ON al.camera_id = c.camera_id
       WHERE al.log_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Attendance log not found' });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: { log: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

// Create a new attendance log (manual entry)
export const createAttendanceLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employee_id, camera_id, gesture_detected, timestamp } = req.body;

    // Validate IDs
    const empId = parseInt(employee_id, 10);
    const camId = parseInt(camera_id, 10);
    if (isNaN(empId) || isNaN(camId)) {
      res.status(400).json({ error: 'Employee ID and Camera ID must be valid numbers' });
      return;
    }

    if (!empId || !camId) {
      throw new ApiError(400, 'Employee ID and Camera ID are required');
    }

    // Check if employee exists
    const employeeExists = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [empId]
    );

    if (employeeExists.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }

    // Check if camera exists
    const cameraExists = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [camId]
    );

    if (cameraExists.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }

    // Create attendance log
    const result = await pool.query(
      `INSERT INTO attendance_logs (
        employee_id, camera_id, gesture_detected, timestamp
      ) VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        empId,
        camId,
        gesture_detected || 'manual_entry',
        timestamp || new Date()
      ]
    );

    // Get employee and camera details for the response
    const log = result.rows[0];
    const employee = employeeExists.rows[0];
    const camera = cameraExists.rows[0];

    res.status(201).json({
      status: 'success',
      data: {
        log: {
          ...log,
          employee_name: employee.name,
          camera_name: camera.camera_name
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete an attendance log
export const deleteAttendanceLog = async (req: Request, res: Response, next: NextFunction): Promise<void>=> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid attendance log ID' });
      return;
    }

    const logExists = await pool.query(
      'SELECT * FROM attendance_logs WHERE log_id = $1',
      [id]
    );

    if (logExists.rows.length === 0) {
      res.status(404).json({ error: 'Attendance log not found' });
      return;
    }

    await pool.query(
      'DELETE FROM attendance_logs WHERE log_id = $1',
      [id]
    );

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// Get attendance summary by date range
export const getAttendanceSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new ApiError(400, 'Start date and end date are required');
    }

    const dailyResult = await pool.query(
      `SELECT 
        DATE(timestamp) as date,
        COUNT(DISTINCT employee_id) as employee_count
       FROM attendance_logs
       WHERE timestamp BETWEEN $1 AND $2
       GROUP BY DATE(timestamp)
       ORDER BY date`,
      [startDate, endDate]
    );

    const employeeResult = await pool.query(
      `SELECT 
        e.employee_id,
        e.name,
        COUNT(DISTINCT DATE(al.timestamp)) as days_present
       FROM employee e
       LEFT JOIN attendance_logs al ON e.employee_id = al.employee_id
       AND al.timestamp BETWEEN $1 AND $2
       GROUP BY e.employee_id, e.name
       ORDER BY days_present DESC`,
      [startDate, endDate]
    );

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

    res.status(200).json({
      status: 'success',
      data: {
        dateRange: {
          startDate,
          endDate,
          totalDays
        },
        dailyAttendance: dailyResult.rows,
        employeeSummary: employeeResult.rows.map(emp => ({
          ...emp,
          attendance_percentage: Math.round((emp.days_present / totalDays) * 100)
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get today's attendance
export const getTodayAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const presentResult = await pool.query(
      `SELECT DISTINCT 
        e.employee_id, 
        e.name,
        e.designation,
        MIN(al.timestamp) as check_in_time
       FROM employee e
       JOIN attendance_logs al ON e.employee_id = al.employee_id
       WHERE DATE(al.timestamp) = $1
       GROUP BY e.employee_id, e.name, e.designation
       ORDER BY check_in_time`,
      [today]
    );

    const allEmployeesResult = await pool.query(
      'SELECT employee_id, name, designation FROM employee'
    );

    const presentEmployeeIds = presentResult.rows.map(emp => emp.employee_id);
    const absentEmployees = allEmployeesResult.rows.filter(
      emp => !presentEmployeeIds.includes(emp.employee_id)
    );

    res.status(200).json({
      status: 'success',
      data: {
        date: today,
        present: {
          count: presentResult.rows.length,
          employees: presentResult.rows
        },
        absent: {
          count: absentEmployees.length,
          employees: absentEmployees
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Record attendance from camera system
export const recordAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employee_id, camera_id, gesture_detected } = req.body;

    // Validate IDs
    const empId = parseInt(employee_id, 10);
    const camId = parseInt(camera_id, 10);
    if (isNaN(empId) || isNaN(camId)) {
    res.status(400).json({ error: 'Employee ID and Camera ID must be valid numbers' });
    return;
    }

    // Check if employee exists
    const employeeExists = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [empId]
    );

    if (employeeExists.rows.length === 0) {
      throw new ApiError(404, 'Employee not found');
    }

    // Check if camera exists
    const cameraExists = await pool.query(
      'SELECT * FROM cctv_cameras WHERE camera_id = $1',
      [camId]
    );

    if (cameraExists.rows.length === 0) {
      throw new ApiError(404, 'Camera not found');
    }

    // Insert attendance log with current timestamp
    const result = await pool.query(
      `INSERT INTO attendance_logs (
        employee_id, camera_id, gesture_detected, timestamp
      ) VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [
        empId,
        camId,
        gesture_detected || 'unknown'
      ]
    );

    const log = result.rows[0];

    res.status(201).json({
      status: 'success',
      data: { log }
    });
  } catch (error) {
    next(error);
  }
};
