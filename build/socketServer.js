"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = void 0;
const socket_io_1 = require("socket.io");
const initSocketServer = (server) => {
    // Create a Socket Server
    const io = new socket_io_1.Server(server);
    io.on('connection', (socket) => {
        console.log('New Client Connected');
        // Прослушивание новое уведомление от клиента
        socket.on('notification', (data) => {
            // Распространение уведомлений всем подключенным клиентам, кроме самого отправителя.
            io.emit('newNotification', data);
        });
        socket.on('disconnect', () => {
            console.log('Client Disconnected');
        });
    });
};
exports.initSocketServer = initSocketServer;
