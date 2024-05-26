import { NextFunction, Request, Response } from 'express';

//Catch async errors
//Обработка ошибок асинхронно
export const catchAsyncError =
    (theFunc: any) => (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(theFunc(req, res, next)).catch(next);
    };
