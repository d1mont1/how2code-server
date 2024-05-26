import { NextFunction, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import orderModel from '../models/order.model';

//Create new order
//Создание нового заказа
export const newOrder = catchAsyncError(async (data: any, res: Response) => {
    const order = await orderModel.create(data);

    res.status(201).json({
        success: true,
        order,
    });
});

//Get all orders
//Получение всех заказов
export const getAllOrdersService = async (res: Response) => {
    const orders = await orderModel.find().sort({ createdAt: -1 });

    res.status(201).json({
        success: true,
        orders,
    });
};
