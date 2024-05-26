# Используйте подходящий базовый образ
FROM node:18

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install

# Копирование всех файлов проекта
COPY . .

# Компиляция TypeScript и сборка проекта (если нужно)
RUN npm run build

# Запуск приложения
CMD ["node", "build/server.js"]
