require('dotenv').config();

import express, { NextFunction, Request, Response } from 'express';
export const app = express();
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ErrorMiddleware } from './middleware/error';
import userRouter from './routes/user.route';
import courseRouter from './routes/course.route';
import orderRouter from './routes/order.route';
import notificationRouter from './routes/notification.route';
import analyticsRouter from './routes/analytics.route';
import layoutRouter from './routes/layout.route';
import { rateLimit } from 'express-rate-limit';

//Body parser
app.use(express.json({ limit: '50mb' }));

//Cookie parser
app.use(cookieParser());

//Cors => cross origin resource sharing
app.use(
    cors({
        origin: ['https://how2code-client-production.up.railway.app'],
        credentials: true,
    }),
);

//Api requests limit
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

//Routes
app.use(
    '/api/v1',
    userRouter,
    orderRouter,
    courseRouter,
    notificationRouter,
    analyticsRouter,
    layoutRouter,
);

//Testing api
app.get('/test', (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
        success: true,
        message: 'API is working',
    });
});

//Unknown route
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Route ${req.originalUrl} not found`) as any;
    err.statusCode = 404;
    next(err);
});

//Middleware calls
app.use(limiter);
app.use(ErrorMiddleware);
