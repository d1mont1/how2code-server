"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../app");
const db_1 = require("../utils/db");
beforeAll(async () => {
    await (0, db_1.connectDB)();
});
describe('Course Controller', () => {
    it('should fetch a single course', async () => {
        const courseId = '664f1b37a3d63344c1265c99';
        const response = await (0, supertest_1.default)(app_1.app).get(`/api/v1/get-course/${courseId}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
    it('should fetch all courses', async () => {
        const response = await (0, supertest_1.default)(app_1.app).get('/api/v1/get-courses');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.courses).toBeInstanceOf(Array);
    });
});
