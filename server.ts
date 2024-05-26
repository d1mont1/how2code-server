import { connect } from 'http2';
import { v2 as cloudinary } from 'cloudinary';
import { app } from './app';
import connectDB from './utils/db';
import http from 'http';
import { initSocketServer } from './socketServer';
require('dotenv').config();

const server = http.createServer(app);

//Конфиг cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_SECRET_KEY,
});

initSocketServer(server);

//Создание сервера
app.listen(process.env.PORT, () => {
    console.log(`Сервер запущен на порту ${process.env.PORT}`);
    connectDB();
});
