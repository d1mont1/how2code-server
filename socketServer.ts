import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

export const initSocketServer = (server: http.Server) => {
    // Create a Socket Server
    const io = new SocketIOServer(server);

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
