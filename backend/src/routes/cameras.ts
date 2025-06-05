import { Router } from 'express';
import { 
  getAllCameras, 
  getCamera, 
  createCamera, 
  updateCamera, 
  deleteCamera 
} from '../controllers/cameraController';

const router = Router();

router.get('/', getAllCameras);
router.get('/:id', getCamera);
router.post('/', createCamera);
router.put('/:id', updateCamera);
router.delete('/:id', deleteCamera);

export default router;