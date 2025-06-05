import { Request, Response } from 'express';
import pool from '../config/db';

export const controlModel = async (req: Request, res: Response) => {
  const { camera_id, model_id, action } = req.body;

  if (!camera_id || !model_id || !action) {
    return res.status(400).json({ error: 'camera_id, model_id, and action are required' });
  }

  try {
    if (action === 'start') {
      const modelResult = await pool.query('SELECT type FROM system_models WHERE model_id = $1', [model_id]);
      const modelType = modelResult.rows[0]?.type;

      if (modelType === 'attendance') {
        const empResult = await pool.query('SELECT COUNT(*) FROM employee');
        const count = parseInt(empResult.rows[0].count);
        if (count === 0) {
          return res.status(400).json({ error: 'No employees registered for attendance tracking' });
        }
      }

      await startModel(camera_id, model_id);
    }

    if (action === 'stop') {
      await stopModel(camera_id, model_id);
    }

    return res.status(200).json({ message: `Model ${action}ed successfully` });
  } catch (err) {
    console.error('Error in model control:', err);
    return res.status(500).json({ error: 'Failed to control model' });
  }
};

export const startModel = async (cameraId: string, modelId: string) => {
  console.log(`✅ Starting model ${modelId} on camera ${cameraId}`);
};

export const stopModel = async (cameraId: string, modelId: string) => {
  console.log(`🛑 Stopping model ${modelId} on camera ${cameraId}`);
};
