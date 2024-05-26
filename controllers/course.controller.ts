import { NextFunction, Request, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import cloudinary from 'cloudinary';
import { createCourse, getAllCoursesService } from '../services/course.service';
import courseModel from '../models/course.model';
import { redis } from '../utils/redis';
import mongoose from 'mongoose';
import ejs from 'ejs';
import path from 'path';
import sendMail from '../utils/sendMail';
import { IUser } from '../models/user.model';
import notificationModel from '../models/notification.model';
import axios from 'axios';
import { stringify } from 'querystring';

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

//Upload course
//Загрузка курса
export const uploadCourse = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = req.body;
            const thumbnail = data.thumbnail;
            if (thumbnail) {
                const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
                    folder: 'courses',
                });

                data.thumbnail = {
                    public_id: myCloud.public_id,
                    url: myCloud.secure_url,
                };
            }
            createCourse(data, res, next);
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Edit course
//Редактирование курса
export const editCourse = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = req.body;
            const thumbnail = data.thumbnail;
            const courseId = req.params.id;

            const isCacheExist = await redis.get(courseId);
            if (isCacheExist) {
                await redis.del(courseId);
            }

            const courseData = (await courseModel.findById(courseId)) as any;

            if (thumbnail && !thumbnail.startsWith('https')) {
                if (courseData && courseData.thumbnail && courseData.thumbnail.public_id)
                    await cloudinary.v2.uploader.destroy(courseData?.thumbnail?.public_id);

                const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
                    folder: 'courses',
                });

                data.thumbnail = {
                    public_id: myCloud.public_id,
                    url: myCloud.secure_url,
                };
            }

            if (thumbnail.startsWith('https')) {
                data.thumbnail = {
                    public_id: courseData?.thumbnail.public_id,
                    url: courseData?.thumbnail.url,
                };
            }

            const course = await courseModel.findByIdAndUpdate(
                courseId,
                {
                    $set: data,
                },
                {
                    new: true,
                },
            );

            res.status(201).json({
                success: true,
                course,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get single course --- without purchasing
//Получение одного курса --- без покупки
export const getSingleCourse = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const courseId = req.params.id;

            const isCacheExist = await redis.get(courseId);

            if (isCacheExist) {
                const course = JSON.parse(isCacheExist);
                res.status(200).json({
                    success: true,
                    course,
                });
            } else {
                const course = await courseModel
                    .findById(req.params.id)
                    .select(
                        '-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links',
                    );

                await redis.set(courseId, JSON.stringify(course), 'EX', 86400);

                res.status(200).json({
                    success: true,
                    course,
                });
            }
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get all courses --- without purchasing
//Получение всех курсов --- без покупки
export const getAllCourses = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const courses = await courseModel
                .find()
                .select(
                    '-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links',
                );

            await redis.set('allCourses', JSON.stringify(courses));

            res.status(200).json({
                success: true,
                courses,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get course content --- only for valid user
//Получение содержания курса --- только для валидного пользователя
export const getCourseByUser = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userCourseList = req.user?.courses;
            const courseId = req.params.id;

            const courseExists = userCourseList?.find(
                (course: any) => course._id.toString() === courseId,
            );

            if (!courseExists) {
                return next(new ErrorHandler('You are not eligible to access this course', 404));
            }

            const course = await courseModel.findById(courseId);

            const content = course?.courseData;
            res.status(200).json({
                success: true,
                content,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Добавление вопроса в курс
interface IAddQuestionData {
    question: string;
    courseId: string;
    contentId: string;
}

export const addQuestion = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { question, courseId, contentId }: IAddQuestionData = req.body;
            const course = await courseModel.findById(courseId);

            if (!mongoose.Types.ObjectId.isValid(contentId)) {
                return next(new ErrorHandler('Invalid content id', 400));
            }

            const courseContent = course?.courseData?.find((item: any) =>
                item._id.equals(contentId),
            );

            if (!courseContent) {
                return next(new ErrorHandler('Invalid content id', 400));
            }

            //Создание нового объекта вопрос
            const newQuestion: any = {
                user: req.user,
                question,
                questionReplies: [],
            };

            //Добавление вопроса в содержание курса
            courseContent.questions.push(newQuestion);

            await notificationModel.create({
                user: req.user?._id,
                title: 'New Question Received',
                message: `You have a new question in ${courseContent.title}`,
            });

            //Сохранение обновленного курса
            await course?.save();

            res.status(200).json({
                success: true,
                course,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Добавление ответа в вопрос курса
interface IAddAnswerData {
    answer: string;
    courseId: string;
    contentId: string;
    questionId: string;
}

export const addAnswer = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { answer, courseId, contentId, questionId }: IAddAnswerData = req.body;

            const course = await courseModel.findById(courseId);

            if (!mongoose.Types.ObjectId.isValid(contentId)) {
                return next(new ErrorHandler('Invalid content id', 400));
            }

            const courseContent = course?.courseData?.find((item: any) =>
                item._id.equals(contentId),
            );

            if (!courseContent) {
                return next(new ErrorHandler('Invalid content id', 400));
            }

            const question = courseContent?.questions?.find((item: any) =>
                item._id.equals(questionId),
            );

            if (!question) {
                return next(new ErrorHandler('Invalid question id', 400));
            }

            //Создание нового объекта ответ
            const newAnswer: any = {
                user: req.user,
                answer,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            //Добавление ответа в содержание курса
            question.questionReplies.push(newAnswer);

            await course?.save();

            if (req.user?._id === question.user._id) {
                //Создание уведомления
                await notificationModel.create({
                    user: req.user?._id,
                    title: 'Получен новый ответ на вопрос',
                    message: `У вас есть новый ответ в ${courseContent.title}`,
                });
            } else {
                const data = {
                    name: question.user.name,
                    title: courseContent.title,
                };

                const html = await ejs.renderFile(
                    path.join(__dirname, '../mails/question-reply.ejs'),
                    data,
                );

                try {
                    await sendMail({
                        email: question.user.email,
                        subject: 'Ответ на вопрос',
                        template: 'question-reply.ejs',
                        data,
                    });
                } catch (error: any) {
                    return next(new ErrorHandler(error.message, 500));
                }
            }
            res.status(200).json({
                success: true,
                course,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Добавление отзыва в курс
interface IAddReviewData {
    review: string;
    rating: number;
    userId: string;
}

export const addReview = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userCourseList = req.user?.courses;

            const courseId = req.params.id;

            //Проверка, существует ли courseId в userCourseList на основе _id
            const courseExists = userCourseList?.some(
                (course: any) => course._id.toString() === courseId.toString(),
            );

            if (!courseExists) {
                return next(new ErrorHandler('You are not eligible to access this course', 404));
            }

            const course = await courseModel.findById(courseId);

            const { review, rating } = req.body as IAddReviewData;

            const reviewData: any = {
                user: req.user,
                comment: review,
                rating,
            };

            course?.reviews.push(reviewData);

            let avg = 0;

            course?.reviews.forEach((rev: any) => {
                avg += rev.rating;
            });

            if (course) {
                course.ratings = avg / course.reviews.length;
            }

            await course?.save();

            await redis.set(courseId, JSON.stringify(course), 'EX', 604800); //604800 = 7 дней

            //Создание уведомления
            await notificationModel.create({
                user: req.user?._id,
                title: 'Получен новый отзыв',
                message: `${req.user?.name} дал отзыв в курсе - ${course?.name}.`,
            });

            res.status(200).json({
                success: true,
                course,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Добавление ответа в отзыв
interface IReviewData {
    comment: string;
    courseId: string;
    reviewId: string;
}

export const addReplyToReview = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { comment, courseId, reviewId }: IReviewData = req.body as IReviewData;

            const course = await courseModel.findById(courseId);

            if (!course) {
                return next(new ErrorHandler('Course not found', 404));
            }

            const review = course?.reviews?.find(
                (rev: any) => rev._id.toString() === reviewId.toString(),
            );

            if (!review) {
                return next(new ErrorHandler('Review not found', 404));
            }

            const replyData: any = {
                user: req.user,
                comment,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            if (!review.commentReplies) {
                review.commentReplies = [];
            }

            review.commentReplies?.push(replyData);

            await course?.save();

            redis.set(courseId, JSON.stringify(course), 'EX', 604800); //604800 = 7 дней

            res.status(200).json({
                success: true,
                course,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    },
);

//Get all courses --- only for admin
//Получение всех курсов --- только для админа
export const getAdminAllCourses = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            getAllCoursesService(res);
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    },
);

//Delete course --- only for admin
//Удаление курса --- только для админа
export const deleteCourse = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params;

            const course = await courseModel.findById(id);

            if (!course) {
                return next(new ErrorHandler('Course not found', 404));
            }

            await course.deleteOne({ id });

            await redis.del(id);

            res.status(200).json({
                success: true,
                message: 'Course deleted successfully',
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    },
);

//Generate video url
//Генерация ссылки на видео
export const generateVideoUrl = catchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { videoId } = req.body;

            const response = await axios.post(
                `https://dev.vdocipher.com/api/videos/${videoId}/otp`,
                { ttl: 300 },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Apisecret ${process.env.VDCIPHER_API_SECRET}`,
                    },
                },
            );

            res.json(response.data);
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    },
);
