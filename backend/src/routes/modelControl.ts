import express, { Request, Response } from 'express';
import { controlModel } from '../controllers/modelControlController';

const router = express.Router();

router.post('/', controlModel);

export default router;
