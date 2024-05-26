import { NextFunction, Request, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import orderModel, { IOrder } from '../models/order.model';
import userModel from '../models/user.model';
import courseModel from '../models/course.model';
import path from 'path';
import ejs from 'ejs';
import sendMail from '../utils/sendMail';
import notificationModel from '../models/notification.model';
import { registrationUser } from '../controllers/user.controller';
import { getAllOrdersService, newOrder } from '../services/order.service';
import { redis } from '../utils/redis';
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//Create order
//Создание заказа
export const createOrder = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { courseId, payment_info } = req.body as IOrder;

            if (payment_info) {
                if ('id' in payment_info) {
                    const paymentIntentId = payment_info.id;
                    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

                    if (paymentIntent.status !== 'succeeded') {
                        return next(new ErrorHandler('Payment not authorized!', 400));
                    }
                }
            }

            const user = await userModel.findById(req.user?._id);

            const courseExistInUser = user?.courses.some(
                (course: any) => course._id.toString() === courseId,
            );

            if (courseExistInUser) {
                return next(new ErrorHandler('You have already purchased this course', 400));
            }

            const course = await courseModel.findById(courseId);

            if (!course) {
                return next(new ErrorHandler('Course not found', 404));
            }

            const data: any = {
                courseId: course._id,
                userId: user?._id,
                payment_info,
            };

            const mailData = {
                order: {
                    _id: course._id.toString().slice(0, 6),
                    name: course.name,
                    price: course.price,
                    date: new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }),
                },
            };

            const html = await ejs.renderFile(
                path.join(__dirname, '../mails/order-confirmation.ejs'),
                { order: mailData },
            );

            try {
                if (user) {
                    await sendMail({
                        email: user.email,
                        subject: 'Order Confirmation',
                        template: 'order-confirmation.ejs',
                        data: mailData,
                    });
                }
            } catch (error: any) {
                return next(new ErrorHandler(error.message, 500));
            }

            user?.courses.push(course?._id);

            await user?.save();

            await redis.set(req.user?._id, JSON.stringify(user));

            await notificationModel.create({
                user: user?._id,
                title: 'New Order',
                message: `You have a new order from ${course?.name}`,
            });

            if (course.purchased !== undefined) course.purchased += 1;

            await course.save();

            const order = await orderModel.create(data);
            res.status(200).json({
                success: true,
                order,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get all orders --- only for admin
//Получение всех заказов --- только для админа
export const getAllOrders = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            getAllOrdersService(res);
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    },
);

//Send stripe publishble key
//Отправка публикуемого ключа
export const sendStripePublishableKey = catchAsyncError(async (req: Request, res: Response) => {
    res.status(200).json({
        publishablekey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
});

//New payment
//Новый платеж
export const newPayment = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const myPayment = await stripe.paymentIntents.create({
                amount: req.body.amount,
                currency: 'USD',
                description: 'Purchase of How2Code course for learning purpose!!',
                metadata: {
                    company: 'How2Code',
                },
                automatic_payment_methods: {
                    enabled: true,
                },
                shipping: {
                    name: 'D O',
                    address: {
                        line1: '510 Townsend St',
                        postal_code: '98140',
                        city: 'San Francisco',
                        state: 'CA',
                        country: 'US',
                    },
                },
            });

            res.status(201).json({
                success: true,
                client_secret: myPayment.client_secret,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);
