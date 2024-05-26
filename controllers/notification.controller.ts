import notificationModel from '../models/notification.model';
import { NextFunction, Request, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import cron from 'node-cron';

//Get all notifications
//Получение всех уведомлений
export const getNotifications = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const notifications = await notificationModel.find().sort({ createdAt: -1 });

            res.status(201).json({
                success: true,
                notifications,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Update notification status --- only admin
//Обновление статуса уведомления --- только для админа
export const updateNotification = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const notification = await notificationModel.findById(req.params.id);
            if (!notification) {
                return next(new ErrorHandler('Notification not found', 404));
            } else {
                notification.status ? (notification.status = 'read') : notification?.status;
            }

            await notification.save();

            const notifications = await notificationModel.find().sort({ createdAt: -1 });

            res.status(201).json({
                success: true,
                notifications,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Delete notification --- only admin
//Удаление уведомления --- только для админа
cron.schedule('0 0 0 * * *', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // удаление уведомлений через 30 дней
    await notificationModel.deleteMany({ status: 'read', createdAt: { $lt: thirtyDaysAgo } });
    console.log('Deleted read notifications');
});
