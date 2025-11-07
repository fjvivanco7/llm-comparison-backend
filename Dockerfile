FROM node:20-alpine

WORKDIR /app

# Copia los archivos de dependencias y Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instala dependencias
RUN npm install

# Genera el cliente Prisma
RUN npx prisma generate

# Copia el resto del código
COPY . .

# Compila el proyecto
RUN npm run build

# Aplica las migraciones (crea las tablas)
RUN npx prisma migrate deploy

# Expone el puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "run", "start:prod"]
