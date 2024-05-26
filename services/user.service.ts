import { Response } from 'express';
import userModel from '../models/user.model';
import { redis } from '../utils/redis';

//Get user by id
//Получение пользователя по id
export const getUserById = async (id: string, res: Response) => {
    const userJson = await redis.get(id);

    if (userJson) {
        const user = JSON.parse(userJson);
        res.status(201).json({
            success: true,
            user,
        });
    }
};

//Get all users
//Получение всех пользователей
export const getAllUsersService = async (res: Response) => {
    const users = await userModel.find().sort({ createdAt: -1 });

    res.status(201).json({
        success: true,
        users,
    });
};

//Update user role
//Обновление роли пользователя
export const updateUserRoleService = async (res: Response, id: string, role: string) => {
    const user = await userModel.findByIdAndUpdate(id, { role }, { new: true });

    res.status(201).json({
        success: true,
        user,
    });
};
