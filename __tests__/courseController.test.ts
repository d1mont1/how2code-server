import request from 'supertest';
import { app } from '../app';
import { connectDB } from '../utils/db';
import mongoose from 'mongoose';

beforeAll(async () => {
    await connectDB();
});

describe('Course Controller', () => {
    it('should fetch a single course', async () => {
        const courseId = '664f1b37a3d63344c1265c99';
        const response = await request(app).get(`/api/v1/get-course/${courseId}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('should fetch all courses', async () => {
        const response = await request(app).get('/api/v1/get-courses');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.courses).toBeInstanceOf(Array);
    });
});
