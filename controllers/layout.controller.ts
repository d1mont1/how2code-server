import { Request, Response, NextFunction } from 'express';
import ErrorHandler from '../utils/ErrorHandler';
import { catchAsyncError } from '../middleware/catchAsyncError';
import layoutModel from '../models/layout.model';
import cloudinary from 'cloudinary';
import { title } from 'process';
import { redis } from '../utils/redis';

//Create layout
//Создание макета
export const createLayout = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = req.body;
            const isTypeExist = await layoutModel.findOne({ type });
            if (isTypeExist) {
                return next(new ErrorHandler(`${type} already exist`, 400));
            }
            if (type === 'Banner') {
                const { image, title, subTitle } = req.body;
                const myCloud = await cloudinary.v2.uploader.upload(image, {
                    folder: 'layout',
                });
                const banner = {
                    type: 'Banner',
                    banner: {
                        image: {
                            public_id: myCloud.public_id,
                            url: myCloud.secure_url,
                        },
                        title,
                        subTitle,
                    },
                };
                await layoutModel.create(banner);
            }
            if (type === 'FAQ') {
                const { faq } = req.body;
                const faqItems = await Promise.all(
                    faq.map(async (item: any) => {
                        return {
                            question: item.question,
                            answer: item.answer,
                        };
                    }),
                );
                await layoutModel.create({ type: 'FAQ', faq: faqItems });
            }
            if (type === 'Categories') {
                const { categories } = req.body;
                const categoriesItems = await Promise.all(
                    categories.map(async (item: any) => {
                        return {
                            title: item.title,
                        };
                    }),
                );
                await layoutModel.create({ type: 'Categories', categories: categoriesItems });
            }

            res.status(200).json({
                success: true,
                message: 'Layout created successfully',
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Edit layout
//Редактирование макета
export const editLayout = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = req.body;
            if (type === 'Banner') {
                const bannerData: any = await layoutModel.findOne({ type: 'Banner' });

                const { image, title, subTitle } = req.body;

                const data = image.startsWith('https')
                    ? bannerData
                    : await cloudinary.v2.uploader.upload(image, {
                          folder: 'layout',
                      });

                const banner = {
                    type: 'Banner',
                    image: {
                        public_id: image.startsWith('https')
                            ? bannerData.banner.image.public_id
                            : data?.public_id,
                        url: image.startsWith('https')
                            ? bannerData.banner.image.url
                            : data?.secure_url,
                    },
                    title,
                    subTitle,
                };

                const isCacheExist = await redis.get('Banner');
                if (isCacheExist) {
                    await redis.del('Banner');
                }

                await layoutModel.findByIdAndUpdate(bannerData._id, { banner });
            }

            if (type === 'FAQ') {
                const { faq } = req.body;
                const faqItem = await layoutModel.findOne({ type: 'FAQ' });
                const faqItems = await Promise.all(
                    faq.map(async (item: any) => {
                        return {
                            question: item.question,
                            answer: item.answer,
                        };
                    }),
                );
                await layoutModel.findByIdAndUpdate(faqItem?._id, { type: 'FAQ', faq: faqItems });

                const isCacheExist = await redis.get('faq');
                if (isCacheExist) {
                    await redis.del('faq');
                }
            }
            if (type === 'Categories') {
                const { categories } = req.body;
                const categoriesData = await layoutModel.findOne({ type: 'Categories' });
                const categoriesItems = await Promise.all(
                    categories.map(async (item: any) => {
                        return {
                            title: item.title,
                        };
                    }),
                );
                await layoutModel.findByIdAndUpdate(categoriesData?._id, {
                    type: 'Categories',
                    categories: categoriesItems,
                });

                const isCacheExist = await redis.get('Categories');
                if (isCacheExist) {
                    await redis.del('Categories');
                }
            }

            res.status(200).json({
                success: true,
                message: 'Layout updated successfully',
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get layout by type
//Получение макета по типу
export const getLayoutByType = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = req.params;
            if (type === 'FAQ') {
                const isCacheExist = await redis.get('faq');
                if (isCacheExist) {
                    const layout = JSON.parse(isCacheExist);
                    res.status(200).json({
                        success: true,
                        layout,
                    });
                    return;
                }
                const layout = await layoutModel.findOne({ type });
                await redis.set('faq', JSON.stringify(layout), 'EX', 604800); // 7 days expiration
                res.status(201).json({
                    success: true,
                    layout,
                });
            } else if (type === 'Banner') {
                const isCacheExist = await redis.get('Banner');
                if (isCacheExist) {
                    const layout = JSON.parse(isCacheExist);
                    res.status(200).json({
                        success: true,
                        layout,
                    });
                    return;
                }
                const layout = await layoutModel.findOne({ type });
                await redis.set('Banner', JSON.stringify(layout), 'EX', 604800); // 7 days expiration
                res.status(201).json({
                    success: true,
                    layout,
                });
            } else if (type === 'Categories') {
                const isCacheExist = await redis.get('Categories');
                if (isCacheExist) {
                    const layout = JSON.parse(isCacheExist);
                    res.status(200).json({
                        success: true,
                        layout,
                    });
                    return;
                }
                const layout = await layoutModel.findOne({ type });
                await redis.set('Categories', JSON.stringify(layout), 'EX', 604800); // изчезнет через 7 дней
                res.status(201).json({
                    success: true,
                    layout,
                });
            }
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);
