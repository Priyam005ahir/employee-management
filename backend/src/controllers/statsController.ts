import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';

// Get dashboard stats
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get cameras count
    const camerasResult = await pool.query('SELECT COUNT(*) as count FROM cctv_cameras');
    const totalCameras = parseInt(camerasResult.rows[0].count);
    
    // Get employees count
    const employeesResult = await pool.query('SELECT COUNT(*) as count FROM employee');
    const totalEmployees = parseInt(employeesResult.rows[0].count);
    
    // Get attendance logs count
    const attendanceResult = await pool.query('SELECT COUNT(*) as count FROM attendance_logs');
    const totalAttendance = parseInt(attendanceResult.rows[0].count);
    
    // Get active employees today
    const today = new Date().toISOString().split('T')[0];
    const activeEmployeesResult = await pool.query(
      'SELECT COUNT(DISTINCT employee_id) as count FROM attendance_logs WHERE DATE(timestamp) = $1 AND gesture_detected = $2',
      [today, 'thumb_up']
    );
    const activeEmployees = parseInt(activeEmployeesResult.rows[0].count);
    
    // Get recent notifications
    const notificationsResult = await pool.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5'
    );
    
    // Get recent attendance logs
    const recentLogsResult = await pool.query(
      `SELECT al.log_id, al.timestamp, al.gesture_detected, 
              e.employee_id, e.employee_name, 
              c.camera_id, c.name as camera_name
       FROM attendance_logs al
       JOIN employee e ON al.employee_id = e.employee_id
       JOIN cctv_cameras c ON al.camera_id = c.camera_id
       ORDER BY al.timestamp DESC
       LIMIT 10`
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalCameras,
          totalEmployees,
          activeEmployees,
          totalAttendance,
        },
        recentNotifications: notificationsResult.rows,
        recentLogs: recentLogsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get attendance stats by time period
export const getAttendanceStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period } = req.query;
    let timeQuery = '';
    
    // Define time period for the query
    switch (period) {
      case 'day':
        timeQuery = "date_trunc('hour', timestamp)";
        break;
      case 'week':
        timeQuery = "date_trunc('day', timestamp)";
        break;
      case 'month':
        timeQuery = "date_trunc('day', timestamp)";
        break;
      case 'year':
        timeQuery = "date_trunc('month', timestamp)";
        break;
      default:
        timeQuery = "date_trunc('day', timestamp)";
    }
    
    // Build the query based on time period
    let query = `
      SELECT 
        ${timeQuery} as time_period,
        COUNT(*) as count
      FROM attendance_logs
    `;
    
    // Add WHERE clause for time filtering
    const params: any[] = [];
    if (period === 'day') {
      query += ' WHERE timestamp >= CURRENT_DATE';
    } else if (period === 'week') {
      query += ' WHERE timestamp >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      query += ' WHERE timestamp >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === 'year') {
      query += ' WHERE timestamp >= CURRENT_DATE - INTERVAL \'1 year\'';
    }
    
    // Group by and order
    query += ` GROUP BY time_period ORDER BY time_period`;
    
    const result = await pool.query(query, params);
    
    res.status(200).json({
      status: 'success',
      data: {
        period: period || 'week',
        stats: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get employee attendance comparison
export const getEmployeeAttendanceComparison = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get attendance count by employee for the last 30 days
    const result = await pool.query(
      `SELECT 
        e.employee_id,
        e.employee_name,
        COUNT(al.log_id) as attendance_count,
        COUNT(DISTINCT DATE(al.timestamp)) as days_present
       FROM employee e
       LEFT JOIN attendance_logs al ON e.employee_id = al.employee_id
       AND al.timestamp >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY e.employee_id, e.employee_name
       ORDER BY days_present DESC, attendance_count DESC`
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        employees: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get camera activity stats
export const getCameraActivityStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get activity count by camera
    const result = await pool.query(
      `SELECT 
        c.camera_id,
        c.name as camera_name,
        c.location,
        COUNT(al.log_id) as activity_count
       FROM cctv_cameras c
       LEFT JOIN attendance_logs al ON c.camera_id = al.camera_id
       GROUP BY c.camera_id, c.name, c.location
       ORDER BY activity_count DESC`
    );
    
    // Get camera status (active/inactive)
    const statusResult = await pool.query(
      `SELECT 
        camera_id,
        status,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM attendance_logs 
            WHERE camera_id = c.camera_id 
            AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
          ) THEN true
          ELSE false
        END as recent_activity
       FROM cctv_cameras c`
    );
    
    // Combine the results
    const cameraStats = result.rows.map(camera => {
      const statusInfo = statusResult.rows.find(s => s.camera_id === camera.camera_id);
      return {
        ...camera,
        status: statusInfo ? statusInfo.status : 'unknown',
        recent_activity: statusInfo ? statusInfo.recent_activity : false
      };
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        cameras: cameraStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get safety incident stats
export const getSafetyIncidentStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // For helmet violations
    const helmetResult = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM helmet_violations
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY date
       ORDER BY date`
    );
    
    // For fire detections
    const fireResult = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM fire_detections
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY date
       ORDER BY date`
    );
    
    // Combine the results into a single timeline
    const dates = new Set<string>();
    
    // Add all dates from both queries
    helmetResult.rows.forEach(row => dates.add(row.date.toString()));
    fireResult.rows.forEach(row => dates.add(row.date.toString()));
    
    // Sort dates
    const sortedDates = Array.from(dates).sort();
    
    // Create the timeline data
    const timeline = sortedDates.map(date => {
      const helmetData = helmetResult.rows.find(r => r.date.toString() === date);
      const fireData = fireResult.rows.find(r => r.date.toString() === date);
      
      return {
        date,
        helmet_violations: helmetData ? parseInt(helmetData.count) : 0,
        fire_detections: fireData ? parseInt(fireData.count) : 0
      };
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        timeline
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get notifications stats
export const getNotificationsStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get recent notifications
    const recentResult = await pool.query(
      `SELECT * FROM notifications 
       ORDER BY created_at DESC 
       LIMIT 20`
    );
    
    // Get unread notifications count
    const unreadResult = await pool.query(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE read = false`
    );
    
    // Get notifications by day for the last 7 days
    const dailyResult = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM notifications
       WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY date
       ORDER BY date`
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        recent: recentResult.rows,
        unread: parseInt(unreadResult.rows[0].count),
        daily: dailyResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Mark notifications as read
export const markNotificationsAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Notification IDs are required');
    }
    
    // Update notifications
    await pool.query(
      `UPDATE notifications 
       SET read = true
       WHERE id = ANY($1)`,
      [ids]
    );
    
    res.status(200).json({
      status: 'success',
      message: 'Notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};
