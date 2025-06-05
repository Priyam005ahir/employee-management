import express from 'express';
import { 
  getAllModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  startModel,
  stopModel
} from '../controllers/modelController';
//import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

/**
 * @route   GET /api/models
 * @desc    Get all AI models
 * @access  Private
 */
router.get('/',  getAllModels);

/**
 * @route   GET /api/models/:id
 * @desc    Get a single AI model by ID
 * @access  Private
 */
router.get('/:id', getModel);

/**
 * @route   POST /api/models
 * @desc    Create a new AI model
 * @access  Private (Admin only)
 */
router.post('/', createModel);

/**
 * @route   PUT /api/models/:id
 * @desc    Update an AI model
 * @access  Private (Admin only)
 */
router.put('/:id', updateModel);

/**
 * @route   DELETE /api/models/:id
 * @desc    Delete an AI model
 * @access  Private (Admin only)
 */
router.delete('/:id', deleteModel);

/**
 * @route   POST /api/models/:id/start
 * @desc    Start an AI model on a specific camera
 * @access  Private
 */
router.post('/:id/start', startModel);

/**
 * @route   POST /api/models/:id/stop
 * @desc    Stop an AI model running on a specific camera
 * @access  Private
 */
router.post('/:id/stop', stopModel);

export default router;
