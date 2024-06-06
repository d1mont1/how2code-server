"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newPayment = exports.sendStripePublishableKey = exports.getAllOrders = exports.createOrder = void 0;
const catchAsyncError_1 = require("../middleware/catchAsyncError");
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const order_model_1 = __importDefault(require("../models/order.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const course_model_1 = __importDefault(require("../models/course.model"));
const path_1 = __importDefault(require("path"));
const ejs_1 = __importDefault(require("ejs"));
const sendMail_1 = __importDefault(require("../utils/sendMail"));
const notification_model_1 = __importDefault(require("../models/notification.model"));
const order_service_1 = require("../services/order.service");
const redis_1 = require("../utils/redis");
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
//Create order
//Создание заказа
exports.createOrder = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { courseId, payment_info } = req.body;
        if (payment_info) {
            if ('id' in payment_info) {
                const paymentIntentId = payment_info.id;
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (paymentIntent.status !== 'succeeded') {
                    return next(new ErrorHandler_1.default('Payment not authorized!', 400));
                }
            }
        }
        const user = await user_model_1.default.findById(req.user?._id);
        const courseExistInUser = user?.courses.some((course) => course._id.toString() === courseId);
        if (courseExistInUser) {
            return next(new ErrorHandler_1.default('You have already purchased this course', 400));
        }
        const course = await course_model_1.default.findById(courseId);
        if (!course) {
            return next(new ErrorHandler_1.default('Course not found', 404));
        }
        const data = {
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
        const html = await ejs_1.default.renderFile(path_1.default.join(__dirname, '../mails/order-confirmation.ejs'), { order: mailData });
        try {
            if (user) {
                await (0, sendMail_1.default)({
                    email: user.email,
                    subject: 'Order Confirmation',
                    template: 'order-confirmation.ejs',
                    data: mailData,
                });
            }
        }
        catch (error) {
            return next(new ErrorHandler_1.default(error.message, 500));
        }
        user?.courses.push(course?._id);
        await user?.save();
        await redis_1.redis.set(req.user?._id, JSON.stringify(user));
        await notification_model_1.default.create({
            user: user?._id,
            title: 'Новая покупка',
            message: `Произведена покупка курса ${course?.name}`,
        });
        if (course.purchased !== undefined)
            course.purchased += 1;
        await course.save();
        const order = await order_model_1.default.create(data);
        res.status(200).json({
            success: true,
            order,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Get all orders --- only for admin
//Получение всех заказов --- только для админа
exports.getAllOrders = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        (0, order_service_1.getAllOrdersService)(res);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
//Send stripe publishble key
//Отправка публикуемого ключа
exports.sendStripePublishableKey = (0, catchAsyncError_1.catchAsyncError)(async (req, res) => {
    res.status(200).json({
        publishablekey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
});
//New payment
//Новый платеж
exports.newPayment = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
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
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
