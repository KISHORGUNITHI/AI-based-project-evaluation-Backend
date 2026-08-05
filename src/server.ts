import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database";
import dotenv from "dotenv";
import {connectRabbitMQ} from "./config/rabbitmq";

dotenv.config();

async function bootstrap() {
	// Database is required — exit if it fails
	try {
		await prisma.$connect();
		console.log("Database connected");
	} catch (error) {
		console.error("Failed to connect to database:", error);
		process.exit(1);
	}

	// RabbitMQ is optional — API server can run without it, only workers need it
	try {
		await connectRabbitMQ();
		console.log("RabbitMQ connected");
	} catch (error) {
		console.warn("RabbitMQ connection failed — queue features unavailable:", error);
	}

	app.listen(env.PORT, () => {
		console.log(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
		console.log(`Swagger UI available at http://localhost:${env.PORT}/api/docs`);
		console.log(`OpenAPI JSON at http://localhost:${env.PORT}/api/docs.json`);
	});
}

bootstrap();
