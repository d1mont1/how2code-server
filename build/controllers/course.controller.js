"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoUrl = exports.deleteCourse = exports.getAdminAllCourses = exports.addReplyToReview = exports.addReview = exports.addAnswer = exports.addQuestion = exports.getCourseByUser = exports.getAllCourses = exports.getSingleCourse = exports.editCourse = exports.uploadCourse = void 0;
const catchAsyncError_1 = require("../middleware/catchAsyncError");
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const cloudinary_1 = __importDefault(require("cloudinary"));
const course_service_1 = require("../services/course.service");
const course_model_1 = __importDefault(require("../models/course.model"));
const redis_1 = require("../utils/redis");
const mongoose_1 = __importDefault(require("mongoose"));
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const sendMail_1 = __importDefault(require("../utils/sendMail"));
const notification_model_1 = __importDefault(require("../models/notification.model"));
const axios_1 = __importDefault(require("axios"));
//Upload course
//Загрузка курса
exports.uploadCourse = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const data = req.body;
        const thumbnail = data.thumbnail;
        if (thumbnail) {
            const myCloud = await cloudinary_1.default.v2.uploader.upload(thumbnail, {
                folder: 'courses',
            });
            data.thumbnail = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url,
            };
        }
        (0, course_service_1.createCourse)(data, res, next);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Edit course
//Редактирование курса
exports.editCourse = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const data = req.body;
        const thumbnail = data.thumbnail;
        const courseId = req.params.id;
        const isCacheExist = await redis_1.redis.get(courseId);
        if (isCacheExist) {
            await redis_1.redis.del(courseId);
        }
        const courseData = (await course_model_1.default.findById(courseId));
        if (thumbnail && !thumbnail.startsWith('https')) {
            if (courseData && courseData.thumbnail && courseData.thumbnail.public_id)
                await cloudinary_1.default.v2.uploader.destroy(courseData?.thumbnail?.public_id);
            const myCloud = await cloudinary_1.default.v2.uploader.upload(thumbnail, {
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
        const course = await course_model_1.default.findByIdAndUpdate(courseId, {
            $set: data,
        }, {
            new: true,
        });
        res.status(201).json({
            success: true,
            course,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Get single course --- without purchasing
//Получение одного курса --- без покупки
exports.getSingleCourse = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const courseId = req.params.id;
        const isCacheExist = await redis_1.redis.get(courseId);
        if (isCacheExist) {
            const course = JSON.parse(isCacheExist);
            res.status(200).json({
                success: true,
                course,
            });
        }
        else {
            const course = await course_model_1.default
                .findById(req.params.id)
                .select('-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links');
            await redis_1.redis.set(courseId, JSON.stringify(course), 'EX', 86400);
            res.status(200).json({
                success: true,
                course,
            });
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Get all courses --- without purchasing
//Получение всех курсов --- без покупки
exports.getAllCourses = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const courses = await course_model_1.default
            .find()
            .select('-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links');
        await redis_1.redis.set('allCourses', JSON.stringify(courses));
        res.status(200).json({
            success: true,
            courses,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Get course content --- only for valid user
//Получение содержания курса --- только для валидного пользователя
exports.getCourseByUser = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const userCourseList = req.user?.courses;
        const courseId = req.params.id;
        const courseExists = userCourseList?.find((course) => course._id.toString() === courseId);
        if (!courseExists) {
            return next(new ErrorHandler_1.default('You are not eligible to access this course', 404));
        }
        const course = await course_model_1.default.findById(courseId);
        const content = course?.courseData;
        res.status(200).json({
            success: true,
            content,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addQuestion = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { question, courseId, contentId } = req.body;
        const course = await course_model_1.default.findById(courseId);
        if (!mongoose_1.default.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler_1.default('Invalid content id', 400));
        }
        const courseContent = course?.courseData?.find((item) => item._id.equals(contentId));
        if (!courseContent) {
            return next(new ErrorHandler_1.default('Invalid content id', 400));
        }
        //Создание нового объекта вопрос
        const newQuestion = {
            user: req.user,
            question,
            questionReplies: [],
        };
        //Добавление вопроса в содержание курса
        courseContent.questions.push(newQuestion);
        await notification_model_1.default.create({
            user: req.user?._id,
            title: 'Новый вопрос',
            message: `У вас есть новый вопрос в курсе ${courseContent.title}`,
        });
        //Сохранение обновленного курса
        await course?.save();
        res.status(200).json({
            success: true,
            course,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addAnswer = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { answer, courseId, contentId, questionId } = req.body;
        const course = await course_model_1.default.findById(courseId);
        if (!mongoose_1.default.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler_1.default('Invalid content id', 400));
        }
        const courseContent = course?.courseData?.find((item) => item._id.equals(contentId));
        if (!courseContent) {
            return next(new ErrorHandler_1.default('Invalid content id', 400));
        }
        const question = courseContent?.questions?.find((item) => item._id.equals(questionId));
        if (!question) {
            return next(new ErrorHandler_1.default('Invalid question id', 400));
        }
        //Создание нового объекта ответ
        const newAnswer = {
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
            await notification_model_1.default.create({
                user: req.user?._id,
                title: 'Получен новый ответ на вопрос',
                message: `У вас есть новый ответ в ${courseContent.title}`,
            });
        }
        else {
            const data = {
                name: question.user.name,
                title: courseContent.title,
            };
            const html = await ejs_1.default.renderFile(path_1.default.join(__dirname, '../mails/question-reply.ejs'), data);
            try {
                await (0, sendMail_1.default)({
                    email: question.user.email,
                    subject: 'Ответ на вопрос',
                    template: 'question-reply.ejs',
                    data,
                });
            }
            catch (error) {
                return next(new ErrorHandler_1.default(error.message, 500));
            }
        }
        res.status(200).json({
            success: true,
            course,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addReview = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const userCourseList = req.user?.courses;
        const courseId = req.params.id;
        //Проверка, существует ли courseId в userCourseList на основе _id
        const courseExists = userCourseList?.some((course) => course._id.toString() === courseId.toString());
        if (!courseExists) {
            return next(new ErrorHandler_1.default('You are not eligible to access this course', 404));
        }
        const course = await course_model_1.default.findById(courseId);
        const { review, rating } = req.body;
        const reviewData = {
            user: req.user,
            comment: review,
            rating,
        };
        course?.reviews.push(reviewData);
        let avg = 0;
        course?.reviews.forEach((rev) => {
            avg += rev.rating;
        });
        if (course) {
            course.ratings = avg / course.reviews.length;
        }
        await course?.save();
        await redis_1.redis.set(courseId, JSON.stringify(course), 'EX', 604800); //604800 = 7 дней
        //Создание уведомления
        await notification_model_1.default.create({
            user: req.user?._id,
            title: 'Получен новый отзыв',
            message: `${req.user?.name} дал отзыв в курсе - ${course?.name}.`,
        });
        res.status(200).json({
            success: true,
            course,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addReplyToReview = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { comment, courseId, reviewId } = req.body;
        const course = await course_model_1.default.findById(courseId);
        if (!course) {
            return next(new ErrorHandler_1.default('Course not found', 404));
        }
        const review = course?.reviews?.find((rev) => rev._id.toString() === reviewId.toString());
        if (!review) {
            return next(new ErrorHandler_1.default('Review not found', 404));
        }
        const replyData = {
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
        redis_1.redis.set(courseId, JSON.stringify(course), 'EX', 604800); //604800 = 7 дней
        res.status(200).json({
            success: true,
            course,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
//Get all courses --- only for admin
//Получение всех курсов --- только для админа
exports.getAdminAllCourses = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        (0, course_service_1.getAllCoursesService)(res);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
//Delete course --- only for admin
//Удаление курса --- только для админа
exports.deleteCourse = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { id } = req.params;
        const course = await course_model_1.default.findById(id);
        if (!course) {
            return next(new ErrorHandler_1.default('Course not found', 404));
        }
        await course.deleteOne({ id });
        await redis_1.redis.del(id);
        res.status(200).json({
            success: true,
            message: 'Course deleted successfully',
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
//Generate video url
//Генерация ссылки на видео
exports.generateVideoUrl = (0, catchAsyncError_1.catchAsyncError)(async (req, res, next) => {
    try {
        const { videoId } = req.body;
        const response = await axios_1.default.post(`https://dev.vdocipher.com/api/videos/${videoId}/otp`, { ttl: 300 }, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Apisecret ${process.env.VDCIPHER_API_SECRET}`,
            },
        });
        res.json(response.data);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
