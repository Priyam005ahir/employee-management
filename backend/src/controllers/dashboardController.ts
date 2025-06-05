import { Request, Response } from 'express';
import pool from '../config/db'
import * as dashboardService from '../services/dashboardService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [cameraRes, employeeRes, attendanceRes, activeRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM cctv_cameras'),
      pool.query('SELECT COUNT(*) FROM employee'),
      pool.query('SELECT COUNT(*) FROM attendance_logs'),
      pool.query(`
        SELECT COUNT(DISTINCT employee_id) FROM attendance_logs 
        WHERE DATE(timestamp) = CURRENT_DATE AND gesture_detected = 'thumb_up'
      `),
    ]);

    res.json({
      totalCameras: parseInt(cameraRes.rows[0].count),
      totalEmployees: parseInt(employeeRes.rows[0].count),
      totalAttendance: parseInt(attendanceRes.rows[0].count),
      activeEmployees: parseInt(activeRes.rows[0].count),
    });
  } catch (error: any) {
  console.error('Error fetching dashboard stats:', error);

  // send full error stack in dev (DO NOT DO THIS IN PRODUCTION)
  res.status(500).json({
    error: 'Failed to load dashboard stats',
    details: error.message || error.toString(),
  });
}
};
